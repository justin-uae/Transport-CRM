"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { sendUserEmail } from "@/lib/userEmail";
import type { EmailAccount } from "@/lib/supabase/database.types";

async function requireOwnAccount() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: account } = await supabase.from("email_accounts").select("*").eq("user_id", profile.id).maybeSingle();
  if (!account) throw new Error("No mailbox is connected for your account yet — ask your Master Admin to connect one in Settings → Users.");
  return { supabase, account: account as EmailAccount };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The composer is a plain-text textarea — this is the only place that turns it into HTML, so it's the only place that needs to guard against building unsafe markup out of it. */
function textToSafeHtml(text: string): string {
  return `<div>${escapeHtml(text)
    .split("\n")
    .join("<br>")}</div>`;
}

// Deliberately permissive (not a full RFC 5322 parser) — just enough to
// catch a typo/garbled address before it reaches the SMTP layer, where it
// would otherwise surface as a raw, unfriendly nodemailer error.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalidAddresses(addresses: string[]): string[] {
  return addresses.filter((a) => !EMAIL_RE.test(a));
}

export async function sendEmailAction(data: {
  to: string;
  cc?: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string | null;
}) {
  const to = data.to
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (to.length === 0) return { error: "Enter at least one recipient." };
  if (!data.subject.trim()) return { error: "Subject is required." };
  if (!data.bodyText.trim()) return { error: "Write a message before sending." };

  const cc = data.cc
    ? data.cc
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
    : undefined;

  const badAddresses = [...invalidAddresses(to), ...invalidAddresses(cc ?? [])];
  if (badAddresses.length > 0) {
    return {
      error: `Invalid recipient address${badAddresses.length > 1 ? "es" : ""}: ${badAddresses.join(", ")}`,
      invalidAddresses: badAddresses,
    };
  }

  try {
    const { supabase, account } = await requireOwnAccount();

    await sendUserEmail(supabase, account, {
      to,
      cc,
      subject: data.subject.trim(),
      html: textToSafeHtml(data.bodyText),
      inReplyTo: data.inReplyTo,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the email." };
  }

  revalidatePath("/email");
  return { error: null };
}

export async function markMessageReadAction(messageId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_messages")
    .update({ is_read: true })
    .eq("id", messageId);
  if (error) throw new Error(error.message);
  revalidatePath("/email");
}
