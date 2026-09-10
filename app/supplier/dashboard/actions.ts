"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupplier } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendTemplatedEmail, type EmailTemplateKey } from "@/lib/emailTemplates";
import { calculateAndRecordCommission } from "@/lib/commissions";
import { createFeedbackRequest } from "@/lib/customerFeedback";

// recordAudit() here always passes the admin client — a supplier has no
// `profiles` row, so audit_log's RLS (which resolves tenant via
// current_tenant_id() -> profiles) would silently reject the insert under
// the supplier's own session, same reasoning as the public /q/[token] flow.
const admin = () => createAdminClient();

/** Notify the job's creator (the dispatching salesperson) about something a supplier just did — job_accepted_by_supplier, job_rejected_by_supplier, supplier_invoice_submitted all follow this shape. */
async function notifyJobCreator(
  adminClient: ReturnType<typeof createAdminClient>,
  input: { tenantId: string; jobId: string; createdBy: string | null; quoteId: string; key: EmailTemplateKey; extraVariables?: Record<string, string> },
) {
  if (!input.createdBy) return;
  const [{ data: profile }, { data: quote }] = await Promise.all([
    adminClient.from("profiles").select("email").eq("id", input.createdBy).maybeSingle(),
    adminClient.from("quotes").select("quote_number, brands(name)").eq("id", input.quoteId).maybeSingle(),
  ]);
  const brand = quote?.brands as unknown as { name: string } | null;
  await sendTemplatedEmail(adminClient, {
    tenantId: input.tenantId,
    key: input.key,
    to: profile?.email,
    variables: {
      quote_number: quote?.quote_number ?? "—",
      brand_name: brand?.name ?? "",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dispatch/${input.jobId}`,
      ...input.extraVariables,
    },
  });
}

interface AllocationJobInfo {
  tenantId: string;
  jobId: string;
  createdBy: string | null;
  quoteId: string;
}

/** Looks up the booking (jobs row) behind an allocation — always via the
 * admin client, since a supplier's own session has no RLS access to `jobs`. */
async function loadAllocationJobInfo(
  adminClient: ReturnType<typeof createAdminClient>,
  allocationId: string,
): Promise<AllocationJobInfo | null> {
  const { data } = await adminClient
    .from("job_allocations")
    .select("job_id, jobs(tenant_id, created_by, quote_id)")
    .eq("id", allocationId)
    .maybeSingle();
  if (!data) return null;
  const job = data.jobs as unknown as { tenant_id: string; created_by: string | null; quote_id: string } | null;
  if (!job) return null;
  return { tenantId: job.tenant_id, jobId: data.job_id, createdBy: job.created_by, quoteId: job.quote_id };
}

export async function acceptJobAllocationOfferAction(allocationId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: allocation, error } = await supabase.rpc("accept_job_allocation_offer", { p_allocation_id: allocationId });
  if (error || !allocation) {
    throw new Error(error?.message ?? "This job offer is no longer available.");
  }

  await recordAudit({
    client: admin(),
    tenantId: supplier.tenant_id,
    actorId: null,
    action: "job_allocation_accepted_by_supplier",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  const info = await loadAllocationJobInfo(admin(), allocationId);
  if (info) {
    await notifyJobCreator(admin(), {
      tenantId: info.tenantId,
      jobId: info.jobId,
      createdBy: info.createdBy,
      quoteId: info.quoteId,
      key: "job_accepted_by_supplier",
      extraVariables: { supplier_name: supplier.name },
    });
  }

  revalidatePath("/supplier/dashboard", "layout");
  revalidatePath("/dispatch");
}

export async function rejectJobAllocationOfferAction(allocationId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: offer, error } = await supabase.rpc("reject_job_allocation_offer", { p_allocation_id: allocationId });
  if (error || !offer) {
    throw new Error(error?.message ?? "This job offer is no longer available.");
  }

  await recordAudit({
    client: admin(),
    tenantId: supplier.tenant_id,
    actorId: null,
    action: "job_allocation_rejected_by_supplier",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  const info = await loadAllocationJobInfo(admin(), allocationId);
  if (info) {
    await notifyJobCreator(admin(), {
      tenantId: info.tenantId,
      jobId: info.jobId,
      createdBy: info.createdBy,
      quoteId: info.quoteId,
      key: "job_rejected_by_supplier",
      extraVariables: { supplier_name: supplier.name },
    });
  }

  revalidatePath("/supplier/dashboard", "layout");
  revalidatePath("/dispatch");
}

export async function uploadSupplierInvoiceAction(
  allocationId: string,
  data: { notes: string; storagePath: string; fileName: string },
) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: allocation } = await supabase
    .from("job_allocations")
    .select("status, assigned_supplier_id, tenant_id, agreed_cost, currency")
    .eq("id", allocationId)
    .single();
  if (!allocation || allocation.assigned_supplier_id !== supplier.id || !["confirmed", "completed"].includes(allocation.status)) {
    throw new Error("You can only upload an invoice once this job is confirmed.");
  }

  // The invoice amount is never taken from the client — it's locked to the
  // agreed cost for this specific allocation, so a supplier can't submit an
  // inflated figure.
  const amount = allocation.agreed_cost;
  if (!amount || amount <= 0) {
    throw new Error("No cost has been agreed for this job yet — contact the office before invoicing.");
  }
  const currency = allocation.currency ?? "EUR";

  const { data: existing } = await supabase
    .from("job_supplier_invoices")
    .select("id, status")
    .eq("job_allocation_id", allocationId)
    .maybeSingle();
  if (existing?.status === "forwarded_to_accounting") {
    throw new Error("This invoice has already been forwarded to accounting and can no longer be edited.");
  }

  const { error } = await supabase.from("job_supplier_invoices").upsert(
    {
      tenant_id: allocation.tenant_id,
      job_allocation_id: allocationId,
      supplier_id: supplier.id,
      amount,
      currency,
      notes: data.notes.trim() || null,
      storage_path: data.storagePath,
      file_name: data.fileName,
      status: "submitted",
    },
    { onConflict: "job_allocation_id" },
  );
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: allocation.tenant_id,
    actorId: null,
    action: existing ? "supplier_invoice_updated" : "supplier_invoice_uploaded",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  const info = await loadAllocationJobInfo(admin(), allocationId);
  if (info) {
    await notifyJobCreator(admin(), {
      tenantId: info.tenantId,
      jobId: info.jobId,
      createdBy: info.createdBy,
      quoteId: info.quoteId,
      key: "supplier_invoice_submitted",
      extraVariables: { supplier_name: supplier.name, currency, amount: amount.toFixed(2) },
    });
  }

  revalidatePath("/supplier/dashboard", "layout");
  revalidatePath("/dispatch");
}

export async function confirmAllocationAction(allocationId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: allocation } = await supabase
    .from("job_allocations")
    .select("status, assigned_supplier_id, tenant_id")
    .eq("id", allocationId)
    .single();
  if (!allocation || allocation.assigned_supplier_id !== supplier.id || allocation.status !== "accepted_by_supplier") {
    throw new Error("This job cannot be confirmed right now.");
  }

  const { error } = await supabase
    .from("job_allocations")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", allocationId);
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: allocation.tenant_id,
    actorId: null,
    action: "job_allocation_confirmed_by_supplier",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  revalidatePath("/supplier/dashboard", "layout");
}

export async function completeAllocationAction(allocationId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: allocation } = await supabase
    .from("job_allocations")
    .select("status, assigned_supplier_id, tenant_id, supplier_payment_status, job_id")
    .eq("id", allocationId)
    .single();
  if (!allocation || allocation.assigned_supplier_id !== supplier.id || allocation.status !== "confirmed") {
    throw new Error("This job cannot be marked completed right now.");
  }
  if (allocation.supplier_payment_status !== "paid") {
    throw new Error("Your invoice must be settled before this job can be marked completed.");
  }

  const { error } = await supabase
    .from("job_allocations")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", allocationId);
  if (error) throw new Error(error.message);

  await recordAudit({
    client: admin(),
    tenantId: allocation.tenant_id,
    actorId: null,
    action: "job_allocation_completed",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  // The recalc_job_status trigger fires (and commits) as part of the update
  // above, so this re-select already reflects it. Commission/feedback only
  // fire once every allocation on the booking has reached 'completed' — not
  // on each individual allocation's own completion.
  const { data: job } = await admin().from("jobs").select("status").eq("id", allocation.job_id).maybeSingle();
  if (job?.status === "completed") {
    // Commission is only ever calculated/recorded here — the canonical rule
    // (projectContext.md §104) is that it's never final before completion.
    await calculateAndRecordCommission(admin(), allocation.job_id);

    // Kicks off the customer-experience feedback loop (Part 25, §153) — a
    // public, no-login feedback link, emailed once per completed booking.
    await createFeedbackRequest(admin(), allocation.job_id);
  }

  revalidatePath("/supplier/dashboard", "layout");
  revalidatePath("/dispatch");
  revalidatePath("/commissions", "layout");
}
