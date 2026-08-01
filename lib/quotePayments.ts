import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CustomerPaymentMethod, QuoteStatus } from "./supabase/database.types";

export { amountDueNow } from "./quoteMoney";

function round2(amount: number) {
  return Math.round(amount * 100) / 100;
}

interface VersionForDue {
  selling_price: number;
  deposit_percentage: number | null;
}

interface RecordCustomerPaymentInput {
  quoteId: string;
  amount: number;
  currency: string;
  method: CustomerPaymentMethod;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  proofStoragePath?: string | null;
  proofFileName?: string | null;
  recordedBy?: string | null;
}

/**
 * Single write path for recording a customer payment against a quote —
 * used by both the Stripe webhook (service-role client) and the manual
 * bank-transfer "record payment" Server Action (request-scoped client,
 * gated on finance.record_payments — see quotes_update/customer_payments_insert
 * RLS in 0013/0016). Sums every payment recorded so far against the
 * selling price and flips the quote to 'paid' — generating the invoice
 * number and creating the dispatch job, exactly like the pre-Stripe
 * markQuotePaidAction did — once the full amount has been received, or
 * 'partially_paid' otherwise.
 */
export async function recordCustomerPayment(
  supabase: SupabaseClient<Database>,
  input: RecordCustomerPaymentInput,
): Promise<{ error: string | null; status: QuoteStatus | null }> {
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, tenant_id, brand_id, customer_id, enquiry_id, status, brands(invoice_number_prefix), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage)",
    )
    .eq("id", input.quoteId)
    .single();

  if (!quote) return { error: "Quote not found.", status: null };
  if (quote.status !== "accepted" && quote.status !== "partially_paid") {
    return { error: "This quote is not awaiting payment.", status: null };
  }

  const version = quote.quote_versions as unknown as VersionForDue | null;
  if (!version) return { error: "This quote has no priced version.", status: null };

  const { error: insertError } = await supabase.from("customer_payments").insert({
    tenant_id: quote.tenant_id,
    quote_id: quote.id,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    stripe_session_id: input.stripeSessionId ?? null,
    stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
    proof_storage_path: input.proofStoragePath ?? null,
    proof_file_name: input.proofFileName ?? null,
    recorded_by: input.recordedBy ?? null,
  });
  if (insertError) return { error: insertError.message, status: null };

  const { data: payments } = await supabase.from("customer_payments").select("amount").eq("quote_id", quote.id);
  const totalPaid = round2((payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0));
  const fullyPaid = totalPaid >= version.selling_price - 0.01;

  if (!fullyPaid) {
    const { error: updateError } = await supabase.from("quotes").update({ status: "partially_paid" }).eq("id", quote.id);
    if (updateError) return { error: updateError.message, status: null };
    await supabase.from("quote_events").insert({ quote_id: quote.id, event: "partially_paid" });
    return { error: null, status: "partially_paid" };
  }

  // jobs.quote_id is unique — a job can already exist here if this quote
  // was somehow finalized once before, so guard against a duplicate insert.
  const { data: existingJob } = await supabase.from("jobs").select("id").eq("quote_id", quote.id).maybeSingle();

  const brand = quote.brands as unknown as { invoice_number_prefix: string } | null;
  const { data: invoiceNumber, error: numberError } = await supabase.rpc("next_document_number", {
    p_brand_id: quote.brand_id,
    p_doc_type: "invoice",
    p_prefix: brand?.invoice_number_prefix ?? "INV",
  });
  if (numberError || !invoiceNumber) return { error: numberError?.message ?? "Could not generate an invoice number.", status: null };

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "paid", invoice_number: invoiceNumber, invoiced_at: new Date().toISOString() })
    .eq("id", quote.id);
  if (updateError) return { error: updateError.message, status: null };

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
      created_by: input.recordedBy ?? null,
    });
    // 23505 = unique_violation — belt-and-suspenders against a genuine race.
    if (jobError && jobError.code !== "23505") return { error: jobError.message, status: null };
  }

  await supabase.from("quote_events").insert({ quote_id: quote.id, event: "paid" });

  return { error: null, status: "paid" };
}
