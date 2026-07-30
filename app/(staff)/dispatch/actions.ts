"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { Profile } from "@/lib/supabase/database.types";

// The user who created the job (i.e. the sales user who marked its quote as
// paid) can always dispatch it themselves — this is the normal path in the
// simplified flow (one person carries a booking from enquiry through to
// supplier assignment). dispatch.send_manual additionally covers a
// dedicated operations role dispatching jobs they didn't personally create.
async function canDispatch(actor: Profile, job: { created_by: string | null }) {
  if (job.created_by === actor.id) return true;
  return hasPermission(actor, PERMISSIONS.DISPATCH_SEND_MANUAL);
}

export async function offerJobToSuppliersAction(jobId: string, supplierIds: string[]) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (supplierIds.length === 0) throw new Error("Select at least one supplier.");

  const { data: job } = await supabase.from("jobs").select("tenant_id, status, created_by").eq("id", jobId).single();
  if (!job || job.tenant_id !== actor.tenant_id) throw new Error("Job not found.");
  if (!(await canDispatch(actor, job))) throw new Error("You do not have permission to dispatch this job.");

  const { error: offersError } = await supabase.from("job_offers").upsert(
    supplierIds.map((supplierId) => ({
      tenant_id: actor.tenant_id,
      job_id: jobId,
      supplier_id: supplierId,
      status: "sent" as const,
      offered_at: new Date().toISOString(),
      responded_at: null,
    })),
    { onConflict: "job_id,supplier_id" },
  );
  if (offersError) throw new Error(offersError.message);

  const { error } = await supabase
    .from("jobs")
    .update({
      assigned_supplier_id: null,
      status: "offered",
      offered_at: new Date().toISOString(),
      responded_at: null,
      confirmed_at: null,
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_offered_to_suppliers",
    entityType: "job",
    entityId: jobId,
    previousValue: { status: job.status },
    newValue: { supplierIds, status: "offered" },
  });

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
}

export async function withdrawAllOffersAction(jobId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("tenant_id, status, created_by").eq("id", jobId).single();
  if (!job || job.tenant_id !== actor.tenant_id) throw new Error("Job not found.");
  if (!(await canDispatch(actor, job))) throw new Error("You do not have permission to dispatch this job.");
  if (job.status !== "offered") throw new Error("This job has no outstanding offers to withdraw.");

  const { error: offersError } = await supabase
    .from("job_offers")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "sent");
  if (offersError) throw new Error(offersError.message);

  const { error } = await supabase.from("jobs").update({ status: "unassigned" }).eq("id", jobId).eq("status", "offered");
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_offers_withdrawn",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
}

export async function transferSupplierInvoiceToAccountingAction(jobId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.DISPATCH_TRANSFER_SUPPLIER_INVOICE);
  if (!allowed) throw new Error("You do not have permission to transfer this invoice to accounting.");

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("job_supplier_invoices")
    .select("id, tenant_id, status")
    .eq("job_id", jobId)
    .single();
  if (!invoice || invoice.tenant_id !== actor.tenant_id) throw new Error("No supplier invoice found for this job.");
  if (invoice.status === "forwarded_to_accounting") throw new Error("This invoice has already been forwarded.");

  const { error } = await supabase
    .from("job_supplier_invoices")
    .update({ status: "forwarded_to_accounting", forwarded_by: actor.id, forwarded_at: new Date().toISOString() })
    .eq("id", invoice.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_invoice_forwarded",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
}

export async function attachSupplierInvoiceAction(jobId: string, note: string, url: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("tenant_id, created_by").eq("id", jobId).single();
  if (!job || job.tenant_id !== actor.tenant_id) throw new Error("Job not found.");
  if (!(await canDispatch(actor, job))) throw new Error("You do not have permission to update this job.");

  const { error } = await supabase
    .from("jobs")
    .update({ supplier_invoice_note: note || null, supplier_invoice_url: url || null })
    .eq("id", jobId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_supplier_invoice_attached",
    entityType: "job",
    entityId: jobId,
    newValue: { note, url },
  });

  revalidatePath("/dispatch");
}
