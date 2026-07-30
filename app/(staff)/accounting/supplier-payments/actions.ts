"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function recordSupplierPaymentAction(
  jobId: string,
  data: { amount: number; currency: string; bankReference: string; notes: string },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_PAY_SUPPLIERS);
  if (!allowed) return { error: "You do not have permission to pay suppliers." };

  if (!data.amount || data.amount <= 0) {
    return { error: "Enter a payment amount greater than zero." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("supplier_payments").insert({
    tenant_id: actor.tenant_id,
    job_id: jobId,
    amount: data.amount,
    currency: data.currency || "EUR",
    bank_reference: data.bankReference.trim() || null,
    notes: data.notes.trim() || null,
    paid_by: actor.id,
  });
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_payment_recorded",
    entityType: "job",
    entityId: jobId,
    newValue: { amount: data.amount, currency: data.currency, bankReference: data.bankReference },
  });

  revalidatePath("/accounting/supplier-payments");
  revalidatePath(`/dispatch/${jobId}`);
  return { error: null };
}
