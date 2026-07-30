"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupplier } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// recordAudit() here always passes the admin client — a supplier has no
// `profiles` row, so audit_log's RLS (which resolves tenant via
// current_tenant_id() -> profiles) would silently reject the insert under
// the supplier's own session, same reasoning as the public /q/[token] flow.
const admin = () => createAdminClient();

export async function acceptJobOfferAction(jobId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: job, error } = await supabase.rpc("accept_job_offer", { p_job_id: jobId });
  if (error || !job) {
    throw new Error(error?.message ?? "This job offer is no longer available.");
  }

  await recordAudit({
    client: admin(),
    tenantId: supplier.tenant_id,
    actorId: null,
    action: "job_accepted_by_supplier",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/supplier/dashboard");
  revalidatePath("/dispatch");
}

export async function rejectJobOfferAction(jobId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: offer, error } = await supabase.rpc("reject_job_offer", { p_job_id: jobId });
  if (error || !offer) {
    throw new Error(error?.message ?? "This job offer is no longer available.");
  }

  await recordAudit({
    client: admin(),
    tenantId: supplier.tenant_id,
    actorId: null,
    action: "job_rejected_by_supplier",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/supplier/dashboard");
  revalidatePath("/dispatch");
}

export async function uploadSupplierInvoiceAction(
  jobId: string,
  data: { amount: number; currency: string; notes: string; storagePath: string; fileName: string },
) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("status, assigned_supplier_id, tenant_id").eq("id", jobId).single();
  if (!job || job.assigned_supplier_id !== supplier.id || !["confirmed", "completed"].includes(job.status)) {
    throw new Error("You can only upload an invoice once this job is confirmed.");
  }

  const { data: existing } = await supabase
    .from("job_supplier_invoices")
    .select("id, status")
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing?.status === "forwarded_to_accounting") {
    throw new Error("This invoice has already been forwarded to accounting and can no longer be edited.");
  }

  const { error } = await supabase.from("job_supplier_invoices").upsert(
    {
      tenant_id: job.tenant_id,
      job_id: jobId,
      supplier_id: supplier.id,
      amount: data.amount,
      currency: data.currency || "EUR",
      notes: data.notes.trim() || null,
      storage_path: data.storagePath,
      file_name: data.fileName,
      status: "submitted",
    },
    { onConflict: "job_id" },
  );
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: job.tenant_id,
    actorId: null,
    action: existing ? "supplier_invoice_updated" : "supplier_invoice_uploaded",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/supplier/dashboard");
  revalidatePath("/dispatch");
}

export async function confirmJobAction(jobId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("status, assigned_supplier_id, tenant_id").eq("id", jobId).single();
  if (!job || job.assigned_supplier_id !== supplier.id || job.status !== "accepted_by_supplier") {
    throw new Error("This job cannot be confirmed right now.");
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: job.tenant_id,
    actorId: null,
    action: "job_confirmed_by_supplier",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/supplier/dashboard");
}

export async function completeJobAction(jobId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("status, assigned_supplier_id, tenant_id").eq("id", jobId).single();
  if (!job || job.assigned_supplier_id !== supplier.id || job.status !== "confirmed") {
    throw new Error("This job cannot be marked completed right now.");
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: job.tenant_id,
    actorId: null,
    action: "job_completed",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/supplier/dashboard");
  revalidatePath("/dispatch");
}
