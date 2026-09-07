"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { recordCustomerPayment, finalizeQuoteFromVerifiedPayments } from "@/lib/quotePayments";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import { generateQuotePdf } from "@/lib/quotePdf";

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
