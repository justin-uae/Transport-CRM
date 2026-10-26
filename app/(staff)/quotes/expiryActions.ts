"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { formatDate } from "@/lib/formatDate";
import { EXPIRY_EDITABLE_STATUSES } from "@/lib/quoteExpiry";

/**
 * Change an existing quote's expiry date (quotes.change_expiry, 0001). The
 * quote is valid until the end of the chosen day (UTC). Extending an
 * already-expired quote re-opens it for the customer — back to "viewed" if
 * they'd opened it before, otherwise "sent". Written with the admin client
 * after the permission check, because quotes_update RLS (0067) doesn't list
 * quotes.change_expiry, so a role granted only that would otherwise no-op.
 */
export async function changeQuoteExpiryAction(quoteId: string, date: string) {
  const actor = await requireProfile();
  if (!(await hasPermission(actor, PERMISSIONS.QUOTES_CHANGE_EXPIRY))) {
    return { error: "You don't have permission to change a quote's expiry date." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };
  const newExpiry = new Date(`${date}T23:59:59Z`);
  if (Number.isNaN(newExpiry.getTime()) || newExpiry.getTime() <= Date.now()) {
    return { error: "The new expiry date must be in the future." };
  }

  // Read through the viewer's own client so RLS still decides whether they
  // can see this quote at all.
  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes").select("id, tenant_id, status, expiry_at, viewed_at").eq("id", quoteId).single();
  if (!quote) return { error: "Quote not found." };
  if (!EXPIRY_EDITABLE_STATUSES.includes(quote.status)) {
    return { error: "This quote has already been decided — its expiry no longer applies." };
  }

  const reopened = quote.status === "expired";
  const admin = createAdminClient();
  const { error } = await admin
    .from("quotes")
    .update({
      expiry_at: newExpiry.toISOString(),
      ...(reopened ? { status: quote.viewed_at ? ("viewed" as const) : ("sent" as const) } : {}),
    })
    .eq("id", quoteId);
  if (error) return { error: error.message };

  const from = quote.expiry_at ? formatDate(quote.expiry_at) : "no expiry";
  await admin.from("quote_events").insert({
    quote_id: quoteId,
    event: "expiry_changed",
    detail: `${from} → ${formatDate(newExpiry.toISOString())} by ${actor.full_name}${reopened ? " (quote re-opened)" : ""}`,
  });
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_expiry_changed",
    entityType: "quote",
    entityId: quoteId,
    previousValue: { expiry_at: quote.expiry_at, status: quote.status },
    newValue: { expiry_at: newExpiry.toISOString(), reopened },
  });

  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}
