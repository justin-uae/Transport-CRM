"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { recordCustomerPayment, finalizeQuoteFromVerifiedPayments } from "@/lib/quotePayments";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import { generateQuotePdf } from "@/lib/quotePdf";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { cancelAllocation } from "@/lib/dispatchAllocations";
import { persistGeneratedPdf } from "@/lib/documentArchive";

/**
 * Manual bank-transfer payment recording, for a deposit, the remaining
 * balance, or the full amount — whichever is currently due. Delegates the
 * "sum payments so far, flip to paid + generate invoice + create the
 * dispatch job once fully covered" logic to lib/quotePayments.ts, the same
 * path the Stripe webhook uses, so both payment methods behave identically.
 */
export async function recordCustomerPaymentAction(
  quoteId: string,
  input: {
    amount: number;
    currency: string;
    proofStoragePath: string;
    proofFileName: string;
    /** Staff has already seen and dismissed the zero/negative or
        above-balance warning (see CustomerPaymentsPage) — skip re-warning
        and save it. These amounts stay permitted after a warning, never
        hard-blocked (PAY-01/PAY-02). */
    confirmedOverride?: boolean;
  },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_RECORD_PAYMENTS);
  if (!allowed) {
    return { error: "You do not have permission to record a customer payment.", status: null };
  }
  if (!input.proofStoragePath || !input.proofFileName) {
    return { error: "Attach proof of payment before recording it.", status: null };
  }
  if (Number.isNaN(input.amount)) {
    return { error: "Enter a valid amount.", status: null };
  }
  const supabase = await createClient();

  if (!input.confirmedOverride) {
    if (input.amount <= 0) {
      return { error: "This amount is zero or negative — confirm to save it anyway.", status: null };
    }
    const { data: quote } = await supabase
      .from("quotes")
      .select("quote_versions!quotes_current_version_id_fkey(selling_price), customer_payments(amount)")
      .eq("id", quoteId)
      .single();
    const version = quote?.quote_versions as unknown as { selling_price: number } | null;
    if (version) {
      const alreadyPaid = ((quote?.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      const remaining = Math.max(0, Math.round((version.selling_price - alreadyPaid) * 100) / 100);
      if (input.amount > remaining) {
        return { error: "This amount is more than the outstanding balance — confirm to save it anyway.", status: null };
      }
    }
  }

  const result = await recordCustomerPayment(supabase, {
    quoteId,
    amount: input.amount,
    currency: input.currency,
    method: "bank_transfer",
    proofStoragePath: input.proofStoragePath,
    proofFileName: input.proofFileName,
    recordedBy: actor.id,
  });
  if (result.error) return result;

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: result.status === "paid" ? "quote_marked_paid" : "quote_payment_recorded",
    entityType: "quote",
    entityId: quoteId,
    newValue: { amount: input.amount, status: result.status, pendingVerification: result.pendingVerification ?? false },
  });

  revalidatePath("/quotes");
  revalidatePath("/dispatch");
  revalidatePath("/bookings");
  return result;
}

/**
 * Finance confirms a pending bank-transfer payment actually arrived — only
 * then does it count toward the quote's balance (PAY-04). Gated on
 * finance.verify_bank_transfers, separate from finance.record_payments
 * (recording and verifying can be different people/roles).
 */
export async function verifyBankTransferAction(paymentId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_VERIFY_BANK_TRANSFERS);
  if (!allowed) {
    return { error: "You do not have permission to verify bank transfers.", status: null };
  }
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("customer_payments")
    .select(
      "id, quote_id, amount, method, verification_status, quotes(id, tenant_id, brand_id, customer_id, enquiry_id, quote_number, public_token, currency, brands(invoice_number_prefix), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage))",
    )
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found.", status: null };
  if (payment.method !== "bank_transfer" || payment.verification_status !== "pending") {
    return { error: "This payment is not awaiting verification.", status: null };
  }

  const { error: updateError } = await supabase
    .from("customer_payments")
    .update({ verification_status: "verified", verified_by: actor.id, verified_at: new Date().toISOString() })
    .eq("id", paymentId);
  if (updateError) return { error: updateError.message, status: null };

  const quote = payment.quotes as unknown as {
    id: string;
    tenant_id: string;
    brand_id: string;
    customer_id: string;
    enquiry_id: string;
    quote_number: string;
    public_token: string;
    currency: string;
    brands: { invoice_number_prefix: string } | null;
    quote_versions: { selling_price: number; deposit_percentage: number | null } | null;
  } | null;
  if (!quote || !quote.quote_versions) return { error: "This quote has no priced version.", status: null };

  const result = await finalizeQuoteFromVerifiedPayments(supabase, {
    id: quote.id,
    tenant_id: quote.tenant_id,
    brand_id: quote.brand_id,
    customer_id: quote.customer_id,
    enquiry_id: quote.enquiry_id,
    quote_number: quote.quote_number,
    public_token: quote.public_token,
    currency: quote.currency,
    brands: quote.brands,
    version: quote.quote_versions,
    recordedBy: actor.id,
    paymentAmount: payment.amount,
  });
  if (result.error) return result;

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "bank_transfer_verified",
    entityType: "quote",
    entityId: quote.id,
    newValue: { paymentId, amount: payment.amount, status: result.status },
  });

  revalidatePath("/quotes");
  revalidatePath("/accounting/customer-payments");
  revalidatePath("/dispatch");
  revalidatePath("/bookings");
  return result;
}

/**
 * Re-sends the "quote sent" email on demand — surfaces the actual failure
 * reason (no email on file, unset SMTP config, rejected by the mail
 * server, ...) via its return value, unlike the automatic send in
 * createQuoteAction which deliberately swallows errors so a mail problem
 * never blocks quote creation itself.
 */
export async function resendQuoteEmailAction(quoteId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_SEND);
  if (!allowed) return { error: "You do not have permission to send quotes." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, public_token, currency, customers(contact_name, company_name, email), brands(name), quote_versions!quotes_current_version_id_fkey(selling_price)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };

  const customer = quote.customers as unknown as { contact_name: string; company_name: string | null; email: string | null } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const version = quote.quote_versions as unknown as { selling_price: number } | null;

  // Same non-fatal-on-failure treatment as the initial send in
  // quotes/new/actions.ts.
  const quotePdf = await generateQuotePdf(supabase, quoteId).catch((err) => {
    console.error(`generateQuotePdf failed for quote ${quoteId}:`, err);
    return null;
  });

  const result = await renderAndSendTemplate(supabase, {
    tenantId: actor.tenant_id,
    key: "quote_sent",
    to: customer?.email,
    variables: {
      customer_name: customer?.company_name || customer?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand?.name ?? "",
      currency: quote.currency,
      selling_price: version ? version.selling_price.toFixed(2) : "",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
    },
    attachments: quotePdf ? [{ filename: `${quote.quote_number}.pdf`, content: quotePdf, contentType: "application/pdf" }] : undefined,
  });

  if (!result.error) {
    if (quotePdf) {
      await persistGeneratedPdf(supabase, {
        tenantId: actor.tenant_id,
        uploadedBy: actor.id,
        docType: "quote",
        label: `Quote ${quote.quote_number}`,
        fileName: `${quote.quote_number}.pdf`,
        quoteId,
        pdf: quotePdf,
      });
    }
    await recordAudit({
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: "quote_email_resent",
      entityType: "quote",
      entityId: quoteId,
    });
  }

  return result;
}

/**
 * Emails the invoice PDF to the customer on demand (DOC-01/02) — separate
 * from resendQuoteEmailAction, which resends the pre-payment quote. Reuses
 * the existing "payment_received" template (the receipt content already
 * fits a "here's your invoice" resend) rather than adding a new template
 * key for what's otherwise the same email. Persists a copy of the generated
 * PDF into the Documents module each time, the same way any other document
 * upload is recorded — so every resend leaves a dated, downloadable trail
 * (DOC-04's "regenerate, audited" without needing a real edit flow, since
 * nothing about a paid quote's invoice is ever edited).
 */
export async function resendInvoiceEmailAction(quoteId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_RESEND);
  if (!allowed) return { error: "You do not have permission to resend invoices." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, public_token, invoice_number, currency, customer_id, customers(contact_name, company_name, email), brands(name), quote_versions!quotes_current_version_id_fkey(selling_price), customer_payments(amount)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };
  if (quote.status !== "paid" || !quote.invoice_number) return { error: "This quote has not been invoiced yet." };

  const customer = quote.customers as unknown as { contact_name: string; company_name: string | null; email: string | null } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const totalPaid = ((quote.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );

  const invoicePdf = await generateInvoicePdf(supabase, quoteId).catch((err) => {
    console.error(`generateInvoicePdf failed for quote ${quoteId}:`, err);
    return null;
  });

  const result = await renderAndSendTemplate(supabase, {
    tenantId: actor.tenant_id,
    key: "payment_received",
    to: customer?.email,
    variables: {
      customer_name: customer?.company_name || customer?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand?.name ?? "",
      currency: quote.currency,
      amount: totalPaid.toFixed(2),
      balance: "0.00",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
    },
    attachments: invoicePdf
      ? [{ filename: `${quote.invoice_number}.pdf`, content: invoicePdf, contentType: "application/pdf" }]
      : undefined,
  });

  if (!result.error) {
    if (invoicePdf) {
      await persistGeneratedPdf(supabase, {
        tenantId: actor.tenant_id,
        uploadedBy: actor.id,
        docType: "invoice",
        label: `Invoice ${quote.invoice_number}`,
        fileName: `${quote.invoice_number}.pdf`,
        quoteId: quote.id,
        pdf: invoicePdf,
      });
    }
    await recordAudit({
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: "invoice_email_resent",
      entityType: "quote",
      entityId: quoteId,
      newValue: { invoiceNumber: quote.invoice_number },
    });
  }

  return result;
}

const CANCELLABLE_STATUSES = ["accepted", "partially_paid", "paid"];

/**
 * OPS-01: cancel a booking that's already been accepted/paid — a distinct
 * staff-initiated action from a customer rejecting a quote (quote_decisions).
 * Reuses the 'cancelled' value already sitting unused on both the
 * quote_status and job_status enums. Any money already collected doesn't get
 * touched in customer_payments (append-only ledger) — it becomes a pending
 * `refunds` row for Finance to action separately via processRefundAction.
 */
export async function cancelBookingAction(quoteId: string, reason: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_CANCEL);
  if (!allowed) return { error: "You do not have permission to cancel a booking." };
  if (!reason.trim()) return { error: "A reason is required to cancel a booking." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, tenant_id, status, currency, customer_payments(amount, verification_status)")
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };
  if (!CANCELLABLE_STATUSES.includes(quote.status)) {
    return { error: "Only an accepted, partially paid, or paid booking can be cancelled." };
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", quoteId);
  if (updateError) return { error: updateError.message };

  const { data: job } = await supabase.from("jobs").select("id").eq("quote_id", quoteId).maybeSingle();
  if (job) {
    // Set the booking's rollup status to 'cancelled' first — recalc_job_status()
    // guards against overwriting a 'cancelled' job, so this must land before
    // the allocation cancellations below, or their own status-change triggers
    // would otherwise bounce jobs.status back to 'unassigned'.
    await supabase.from("jobs").update({ status: "cancelled" }).eq("id", job.id);

    const { data: liveAllocations } = await supabase
      .from("job_allocations")
      .select("id")
      .eq("job_id", job.id)
      .not("status", "in", "(completed,cancelled)");
    for (const allocation of liveAllocations ?? []) {
      await cancelAllocation(supabase, allocation.id);
    }
  }

  const verifiedPaid = ((quote.customer_payments as unknown as { amount: number; verification_status: string }[] | null) ?? [])
    .filter((p) => p.verification_status === "verified")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  if (verifiedPaid > 0) {
    await supabase.from("refunds").insert({
      tenant_id: quote.tenant_id,
      quote_id: quoteId,
      amount: verifiedPaid,
      currency: quote.currency,
      reason: reason.trim(),
      requested_by: actor.id,
    });
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "booking_cancelled",
    entityType: "quote",
    entityId: quoteId,
    previousValue: { status: quote.status },
    newValue: { status: "cancelled" },
    reason: reason.trim(),
  });

  revalidatePath("/quotes");
  revalidatePath("/bookings");
  revalidatePath("/dispatch");
  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}

/** Finance confirms a cancellation's pending refund has actually been paid out. */
export async function processRefundAction(refundId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_PROCESS_REFUNDS);
  if (!allowed) return { error: "You do not have permission to process refunds." };

  const supabase = await createClient();
  const { data: refund } = await supabase.from("refunds").select("id, quote_id, status").eq("id", refundId).single();
  if (!refund) return { error: "Refund not found." };
  if (refund.status !== "pending") return { error: "This refund has already been processed." };

  const { error } = await supabase
    .from("refunds")
    .update({ status: "processed", processed_by: actor.id, processed_at: new Date().toISOString() })
    .eq("id", refundId);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "refund_processed",
    entityType: "refund",
    entityId: refundId,
    previousValue: { status: "pending" },
    newValue: { status: "processed" },
  });

  revalidatePath(`/quotes/${refund.quote_id}`);
  revalidatePath("/accounting/customer-payments");
  return { error: null };
}

