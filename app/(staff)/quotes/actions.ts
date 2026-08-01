"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { recordCustomerPayment } from "@/lib/quotePayments";

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
