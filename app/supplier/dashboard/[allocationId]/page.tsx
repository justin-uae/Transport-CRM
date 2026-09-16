import { notFound } from "next/navigation";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupplierJobDetail } from "@/components/pages/SupplierJobDetail";
import type { JobAllocationOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function SupplierJobDetailPage({ params }: { params: Promise<{ allocationId: string }> }) {
  const { allocationId } = await params;
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: job }, { data: invoice }, { data: pendingAmendment }] = await Promise.all([
    supabase.from("job_allocation_offer_view").select("*").eq("job_allocation_id", allocationId).maybeSingle(),
    supabase.from("job_supplier_invoices").select("*").eq("job_allocation_id", allocationId).eq("supplier_id", supplier.id).maybeSingle(),
    // booking_amendments' RLS is staff-only (bookings.view) — a supplier has
    // no profiles/permissions row to satisfy it, so this goes through the
    // admin client. Safe to do unconditionally: the `job` fetch above is
    // still RLS-scoped to this supplier, and we 404 below if it's empty, so
    // this reason/changes text is only ever rendered once that's confirmed.
    createAdminClient()
      .from("booking_amendments")
      .select("reason, changes")
      .eq("job_allocation_id", allocationId)
      .eq("supplier_approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!job) notFound();

  let invoiceUrl: string | null = null;
  if (invoice) {
    const { data: signed } = await supabase.storage.from("job-invoices").createSignedUrl(invoice.storage_path, 3600);
    invoiceUrl = signed?.signedUrl ?? null;
  }

  return (
    <SupplierJobDetail
      job={job as JobAllocationOfferView}
      invoice={invoice as JobSupplierInvoice | null}
      invoiceUrl={invoiceUrl}
      supplierId={supplier.id}
      pendingAmendment={pendingAmendment as { reason: string; changes: Record<string, { from: unknown; to: unknown }> } | null}
    />
  );
}
