"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { recordCustomerPayment } from "@/lib/quotePayments";
import { renderAndSendTemplate } from "@/lib/emailTemplates";

/**
 * Manual bank-transfer payment recording, for a deposit, the remaining
 * balance, or the full amount — whichever is currently due. Delegates the
 * "sum payments so far, flip to paid + generate invoice + create the
 * dispatch job once fully covered" logic to lib/quotePayments.ts, the same
 * path the Stripe webhook uses, so both payment methods behave identically.
 */
export async function recordCustomerPaymentAction(
  quoteId: string,
  input: { amount: number; currency: string; proofStoragePath: string; proofFileName: string },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_RECORD_PAYMENTS);
  if (!allowed) {
    return { error: "You do not have permission to record a customer payment.", status: null };
  }
  if (!input.proofStoragePath || !input.proofFileName) {
    return { error: "Attach proof of payment before recording it.", status: null };
  }
  if (!input.amount || input.amount <= 0) {
    return { error: "Enter an amount greater than zero.", status: null };
  }
  const supabase = await createClient();

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
    newValue: { amount: input.amount, status: result.status },
  });

  revalidatePath("/quotes");
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
