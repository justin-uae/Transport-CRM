"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

/**
 * Manual "paid" flip once the customer's bank transfer has arrived — no
 * Stripe/reconciliation yet, this is a deliberate simplification (see the
 * Phase 2.5 plan). Also creates the job that Dispatch will assign to a
 * supplier once region-matched.
 */
export async function markQuotePaidAction(quoteId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, tenant_id, brand_id, customer_id, status, enquiry_id, brands(invoice_number_prefix)")
    .eq("id", quoteId)
    .single();

  if (!quote || quote.status !== "accepted") {
    return { error: "Only an accepted quote can be marked as paid." };
  }

  const brand = quote.brands as unknown as { invoice_number_prefix: string } | null;
  const { data: invoiceNumber, error: numberError } = await supabase.rpc("next_document_number", {
    p_brand_id: quote.brand_id,
    p_doc_type: "invoice",
    p_prefix: brand?.invoice_number_prefix ?? "INV",
  });
  if (numberError || !invoiceNumber) {
    return { error: numberError?.message ?? "Could not generate an invoice number." };
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "paid", invoice_number: invoiceNumber, invoiced_at: new Date().toISOString() })
    .eq("id", quoteId);
  if (updateError) return { error: updateError.message };

  const { data: leg } = await supabase
    .from("enquiry_legs")
    .select("pickup_address")
    .eq("enquiry_id", quote.enquiry_id)
    .eq("sequence", 1)
    .single();

  const { error: jobError } = await supabase.from("jobs").insert({
    tenant_id: quote.tenant_id,
    quote_id: quote.id,
    brand_id: quote.brand_id,
    customer_id: quote.customer_id,
    region: leg?.pickup_address ?? null,
    status: "unassigned",
    created_by: actor.id,
  });
  if (jobError) return { error: jobError.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_marked_paid",
    entityType: "quote",
    entityId: quoteId,
    newValue: { invoiceNumber },
  });

  revalidatePath("/quotes");
  revalidatePath("/dispatch");
  return { error: null };
}
