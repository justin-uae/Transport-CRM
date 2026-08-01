"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

/**
 * Manual "paid" flip once the customer's bank transfer has arrived — no
 * Stripe/reconciliation yet, this is a deliberate simplification (see the
 * Phase 2.5 plan). Also creates the job that Dispatch will assign to a
 * supplier once region-matched.
 */
export async function markQuotePaidAction(
  quoteId: string,
  proof: { proofStoragePath: string; proofFileName: string },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_RECORD_PAYMENTS);
  if (!allowed) {
    return { error: "You do not have permission to record a customer payment." };
  }
  if (!proof.proofStoragePath || !proof.proofFileName) {
    return { error: "Attach proof of payment before marking this quote as paid." };
  }
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, tenant_id, brand_id, customer_id, status, enquiry_id, brands(invoice_number_prefix)")
    .eq("id", quoteId)
    .single();

  if (!quote || quote.status !== "accepted") {
    return { error: "Only an accepted quote can be marked as paid." };
  }

  // jobs.quote_id is unique — a job can already exist here (e.g. this quote
  // was marked paid once before and later reverted back to "accepted", or
  // this request is a retry of one that partially succeeded). If so, the
  // operational side is already handled; just record the payment/invoice
  // below instead of trying to insert a second job for the same quote.
  const { data: existingJob } = await supabase.from("jobs").select("id").eq("quote_id", quoteId).maybeSingle();

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
    .update({
      status: "paid",
      invoice_number: invoiceNumber,
      invoiced_at: new Date().toISOString(),
      payment_proof_storage_path: proof.proofStoragePath,
      payment_proof_file_name: proof.proofFileName,
    })
    .eq("id", quoteId);
  if (updateError) return { error: updateError.message };

  if (!existingJob) {
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
    // 23505 = unique_violation — belt-and-suspenders against a genuine race
    // (two near-simultaneous clicks both passing the existingJob check
    // above); treat it the same as finding the job up front.
    if (jobError && jobError.code !== "23505") return { error: jobError.message };
  }

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
  revalidatePath("/bookings");
  return { error: null };
}
