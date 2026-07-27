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

export async function assignSupplierAction(jobId: string, supplierId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("tenant_id, status, created_by").eq("id", jobId).single();
  if (!job || job.tenant_id !== actor.tenant_id) throw new Error("Job not found.");
  if (!(await canDispatch(actor, job))) throw new Error("You do not have permission to dispatch this job.");

  const { error } = await supabase
    .from("jobs")
    .update({
      assigned_supplier_id: supplierId,
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
    action: "job_offered_to_supplier",
    entityType: "job",
    entityId: jobId,
    previousValue: { status: job.status },
    newValue: { supplierId, status: "offered" },
  });

  revalidatePath("/dispatch");
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
