import "server-only";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import type { Database, EmailAccount } from "@/lib/supabase/database.types";

/**
 * Sends mail through a staff member's own connected SMTP account (not the
 * shared transactional SMTP_* config in lib/email.ts) and records the
 * outbound copy in email_messages immediately, so it shows up in the Email
 * Centre's Sent folder without waiting for the next IMAP poll — only INBOX
 * is polled by app/api/cron/email-sync/route.ts.
 */
export async function sendUserEmail(
  supabase: SupabaseClient<Database>,
  account: EmailAccount,
  {
    to,
    cc,
    subject,
    html,
    inReplyTo,
  }: { to: string[]; cc?: string[]; subject: string; html: string; inReplyTo?: string | null },
) {
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_security === "ssl",
    auth: { user: account.smtp_username, pass: decryptSecret(account.smtp_password_enc) },
  });

  const info = await transporter.sendMail({
    from: `"${account.display_name}" <${account.email_address}>`,
    to: to.join(", "),
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html,
    inReplyTo: inReplyTo ?? undefined,
  });

  const { error } = await supabase.from("email_messages").insert({
    tenant_id: account.tenant_id,
    email_account_id: account.id,
    direction: "outbound",
    folder: "sent",
    message_uid: info.messageId ?? crypto.randomUUID(),
    message_id: info.messageId ?? null,
    in_reply_to: inReplyTo ?? null,
    thread_key: inReplyTo ?? info.messageId ?? null,
    from_name: account.display_name,
    from_address: account.email_address,
    to_addresses: to,
    cc_addresses: cc ?? [],
    subject,
    body_html: html,
    body_text: null,
    snippet: html.replace(/<[^>]+>/g, "").slice(0, 200),
    has_attachments: false,
    attachment_meta: [],
    is_read: true,
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Sent, but could not save it to the Email Centre: ${error.message}`);
}
