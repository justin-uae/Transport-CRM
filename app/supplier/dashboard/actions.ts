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

  await notifyJobCreator(admin(), {
    tenantId: job.tenant_id,
    jobId,
    createdBy: job.created_by,
    quoteId: job.quote_id,
    key: "job_accepted_by_supplier",
    extraVariables: { supplier_name: supplier.name },
  });

  revalidatePath("/supplier/dashboard", "layout");
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

  const { data: job } = await admin().from("jobs").select("tenant_id, created_by, quote_id").eq("id", jobId).maybeSingle();
  if (job) {
    await notifyJobCreator(admin(), {
      tenantId: job.tenant_id,
      jobId,
      createdBy: job.created_by,
      quoteId: job.quote_id,
      key: "job_rejected_by_supplier",
      extraVariables: { supplier_name: supplier.name },
    });
  }

  revalidatePath("/supplier/dashboard", "layout");
  revalidatePath("/dispatch");
}

export async function uploadSupplierInvoiceAction(
  jobId: string,
  data: { notes: string; storagePath: string; fileName: string },
) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("status, assigned_supplier_id, tenant_id, quote_id, created_by")
    .eq("id", jobId)
    .single();
  if (!job || job.assigned_supplier_id !== supplier.id || !["confirmed", "completed"].includes(job.status)) {
    throw new Error("You can only upload an invoice once this job is confirmed.");
  }

  // The invoice amount is never taken from the client — it's locked to the
  // company's own supplier-cost estimate captured at quote creation time, so
  // a supplier can't submit an inflated figure. Read via the admin client:
  // a supplier session has no `profiles` row, so quotes/quote_versions RLS
  // (tenant-scoped to a profile) would otherwise return nothing here —
  // ownership was already verified against the job row above.
  const { data: quote } = await admin()
    .from("quotes")
    .select("currency, quote_versions!quotes_current_version_id_fkey(supplier_estimated_cost)")
    .eq("id", job.quote_id)
    .single();
  const version = quote?.quote_versions as unknown as { supplier_estimated_cost: number | null } | null;
  const amount = version?.supplier_estimated_cost;
  if (!amount || amount <= 0) {
    throw new Error("No supplier cost has been set for this job yet — contact the office before invoicing.");
  }
  const currency = quote?.currency ?? "EUR";

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
      amount,
      currency,
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

  await notifyJobCreator(admin(), {
    tenantId: job.tenant_id,
    jobId,
    createdBy: job.created_by,
    quoteId: job.quote_id,
    key: "supplier_invoice_submitted",
    extraVariables: { supplier_name: supplier.name, currency, amount: amount.toFixed(2) },
  });

  revalidatePath("/supplier/dashboard", "layout");
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

  revalidatePath("/supplier/dashboard", "layout");
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

  // Commission is only ever calculated/recorded here — the canonical rule
  // (projectContext.md §104) is that it's never final before completion.
  // Runs on the admin client since a supplier session has no RLS access to
  // commissions at all (it's an internal financial record, not theirs).
  await calculateAndRecordCommission(admin(), jobId);

  // Kicks off the customer-experience feedback loop (Part 25, §153) — a
  // public, no-login feedback link, emailed once per completed job.
  await createFeedbackRequest(admin(), jobId);

  revalidatePath("/supplier/dashboard", "layout");
  revalidatePath("/dispatch");
  revalidatePath("/commissions", "layout");
}
