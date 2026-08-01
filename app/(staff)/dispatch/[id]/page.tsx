import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { DispatchJobDetail, type JobDetailRow } from "@/components/pages/DispatchJobDetail";
import type { SupplierOption } from "@/components/pages/DispatchBoard";
import type { JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function DispatchJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const supabase = await createClient();

  const [{ data: job }, { data: suppliers }, { data: invoice }, { data: supplierPayments }, canTransfer, canDispatchManual] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, status, region, supplier_payment_status, offered_at, responded_at, confirmed_at, completed_at, supplier_invoice_note, supplier_invoice_url, created_at, created_by, quotes(quote_number, currency, customers(company_name, contact_name, phone, email), enquiries(enquiry_legs(sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(selling_price)), suppliers(id, name, region, phone, email), job_offers(id, status, offered_at, responded_at, suppliers(id, name, region))",
      )
      .eq("id", id)
      .single(),
    supabase.from("suppliers").select("id, name, region").eq("status", "approved").order("name"),
    supabase.from("job_supplier_invoices").select("*").eq("job_id", id).maybeSingle(),
    supabase.from("supplier_payments").select("id, amount, currency, bank_reference, paid_at").eq("job_id", id).order("paid_at"),
    hasPermission(actor, PERMISSIONS.DISPATCH_TRANSFER_SUPPLIER_INVOICE),
    hasPermission(actor, PERMISSIONS.DISPATCH_SEND_MANUAL),
  ]);

  if (!job) notFound();

  // Mirrors canDispatch() in app/(staff)/dispatch/actions.ts — owning the
  // job (it was created from a quote this user handled) is enough even
  // without the blanket dispatch.send_manual permission.
  const canDispatchJobs = job.created_by === actor.id || canDispatchManual;

  let invoiceUrl: string | null = null;
  if (invoice) {
    const { data: signed } = await supabase.storage.from("job-invoices").createSignedUrl(invoice.storage_path, 3600);
    invoiceUrl = signed?.signedUrl ?? null;
  }

  return (
    <DispatchJobDetail
      job={job as unknown as JobDetailRow}
      suppliers={(suppliers ?? []) as unknown as SupplierOption[]}
      invoice={invoice as unknown as JobSupplierInvoice | null}
      invoiceUrl={invoiceUrl}
      supplierPayments={supplierPayments ?? []}
      canTransferInvoice={canTransfer}
      canDispatchJobs={canDispatchJobs}
    />
  );
}
