"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { getStripeClient, toStripeAmount } from "@/lib/stripe";
import { amountDueNow } from "@/lib/quotePayments";

async function loadDecidableQuote(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: quote } = await admin.from("quotes").select("id, tenant_id, status").eq("public_token", token).single();
  return quote;
}

const PAYABLE = new Set(["accepted", "partially_paid"]);

async function loadPayableQuote(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, tenant_id, status, currency, quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage, payment_methods), customer_payments(amount)",
    )
    .eq("public_token", token)
    .single();
  return quote;
}

export async function choosePaymentMethodAction(token: string, method: "stripe" | "bank_transfer" | null) {
  const admin = createAdminClient();
  const quote = await loadDecidableQuote(admin, token);
  if (!quote || !PAYABLE.has(quote.status)) {
    return { error: "This quote is not awaiting payment." };
  }

  await admin.from("quotes").update({ payment_method_chosen: method }).eq("id", quote.id);
  revalidatePath(`/q/${token}`);
  return { error: null };
}

export async function createStripeCheckoutAction(token: string) {
  const admin = createAdminClient();
  const quote = await loadPayableQuote(admin, token);
  if (!quote || !PAYABLE.has(quote.status)) {
    return { error: "This quote is not awaiting payment.", url: null };
  }

  const version = quote.quote_versions as unknown as {
    selling_price: number;
    deposit_percentage: number | null;
    payment_methods: { stripe: boolean; bank_transfer: boolean };
  } | null;
  if (!version) return { error: "This quote has no priced version.", url: null };
  if (!version.payment_methods?.stripe) return { error: "Online payment is not available for this quote.", url: null };

  const alreadyPaid = ((quote.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const due = amountDueNow(version, alreadyPaid);
  if (due <= 0) return { error: "This quote has already been paid in full.", url: null };

  await admin.from("quotes").update({ payment_method_chosen: "stripe" }).eq("id", quote.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Pinned to card so payment always confirms synchronously at checkout
      // — leaving this to Stripe's automatic payment methods could enable a
      // delayed method (e.g. a bank debit), which completes the *session*
      // immediately but confirms the *payment* later via a separate
      // checkout.session.async_payment_succeeded event our webhook doesn't
      // listen for yet.
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: quote.currency,
            unit_amount: toStripeAmount(due, quote.currency),
            product_data: { name: `Quote payment${version.deposit_percentage ? ` (${version.deposit_percentage}% deposit)` : ""}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/q/${token}?payment=success`,
      cancel_url: `${appUrl}/q/${token}?payment=cancelled`,
      metadata: { quoteId: quote.id },
    });
    return { error: null, url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the Stripe checkout.", url: null };
  }
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
