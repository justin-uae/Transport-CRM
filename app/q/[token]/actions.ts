"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

async function loadDecidableQuote(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: quote } = await admin.from("quotes").select("id, tenant_id, status").eq("public_token", token).single();
  return quote;
}

export async function acceptQuoteAction(token: string) {
  const admin = createAdminClient();
  const quote = await loadDecidableQuote(admin, token);
  if (!quote || (quote.status !== "sent" && quote.status !== "viewed")) {
    return { error: "This quote can no longer be accepted." };
  }

  const headerList = await headers();
  await admin.from("quote_decisions").insert({
    quote_id: quote.id,
    decision: "accepted",
    ip_address: headerList.get("x-forwarded-for"),
  });
  await admin
    .from("quotes")
    .update({ status: "accepted", decided_at: new Date().toISOString() })
    .eq("id", quote.id);
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "accepted" });

  await recordAudit({
    client: admin,
    tenantId: quote.tenant_id,
    actorId: null,
    action: "quote_accepted",
    entityType: "quote",
    entityId: quote.id,
  });

  revalidatePath(`/q/${token}`);
  return { error: null };
}

export async function rejectQuoteAction(token: string, reason: string | null) {
  const admin = createAdminClient();
  const quote = await loadDecidableQuote(admin, token);
  if (!quote || (quote.status !== "sent" && quote.status !== "viewed")) {
    return { error: "This quote can no longer be rejected." };
  }

  const headerList = await headers();
  await admin.from("quote_decisions").insert({
    quote_id: quote.id,
    decision: "rejected",
    reason,
    ip_address: headerList.get("x-forwarded-for"),
  });
  await admin
    .from("quotes")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", quote.id);
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "rejected" });

  await recordAudit({
    client: admin,
    tenantId: quote.tenant_id,
    actorId: null,
    action: "quote_rejected",
    entityType: "quote",
    entityId: quote.id,
    reason,
  });

  revalidatePath(`/q/${token}`);
  return { error: null };
}
