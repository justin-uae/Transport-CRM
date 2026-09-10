import { notFound } from "next/navigation";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierJobDetail } from "@/components/pages/SupplierJobDetail";
import type { JobAllocationOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function SupplierJobDetailPage({ params }: { params: Promise<{ allocationId: string }> }) {
  const { allocationId } = await params;
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: job }, { data: invoice }] = await Promise.all([
    supabase.from("job_allocation_offer_view").select("*").eq("job_allocation_id", allocationId).maybeSingle(),
    supabase.from("job_supplier_invoices").select("*").eq("job_allocation_id", allocationId).eq("supplier_id", supplier.id).maybeSingle(),
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
    />
  );
}
