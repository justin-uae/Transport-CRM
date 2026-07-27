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

export async function respondToJobAction(jobId: string, decision: "accepted_by_supplier" | "rejected_by_supplier") {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("status, assigned_supplier_id, tenant_id").eq("id", jobId).single();
  if (!job || job.assigned_supplier_id !== supplier.id || job.status !== "offered") {
    throw new Error("This job is no longer available to respond to.");
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: job.tenant_id,
    actorId: null,
    action: decision === "accepted_by_supplier" ? "job_accepted_by_supplier" : "job_rejected_by_supplier",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/supplier/dashboard");
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
