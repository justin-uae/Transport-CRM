import { notFound } from "next/navigation";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierJobDetail } from "@/components/pages/SupplierJobDetail";
import type { JobOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function SupplierJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: job }, { data: invoice }] = await Promise.all([
    supabase.from("job_offer_view").select("*").eq("job_id", jobId).maybeSingle(),
    supabase.from("job_supplier_invoices").select("*").eq("job_id", jobId).eq("supplier_id", supplier.id).maybeSingle(),
  ]);

  if (!job) notFound();

  let invoiceUrl: string | null = null;
  if (invoice) {
    const { data: signed } = await supabase.storage.from("job-invoices").createSignedUrl(invoice.storage_path, 3600);
    invoiceUrl = signed?.signedUrl ?? null;
  }

  return (
    <SupplierJobDetail
      job={job as JobOfferView}
      invoice={invoice as JobSupplierInvoice | null}
      invoiceUrl={invoiceUrl}
      supplierId={supplier.id}
    />
  );
}
