import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { DispatchJobDetail, type JobDetailRow, type JobAllocationRow } from "@/components/pages/DispatchJobDetail";
import type { SupplierOption } from "@/components/pages/DispatchBoard";

export default async function DispatchJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const supabase = await createClient();

  const [{ data: job }, { data: allocations }, { data: suppliers }, canTransfer, canDispatchManual] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, status, region, created_at, created_by, quotes(quote_number, currency, customers(company_name, contact_name, phone, email), enquiries(enquiry_legs(id, sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(selling_price))",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("job_allocations")
      .select(
        "id, status, assigned_supplier_id, vehicle_notes, agreed_cost, currency, supplier_payment_status, manual_invoice_note, manual_invoice_url, offered_at, confirmed_at, completed_at, created_at, suppliers(id, name, region, phone, email), job_allocation_legs(enquiry_leg_id), job_allocation_offers(id, status, offered_at, responded_at, suppliers(id, name, region)), job_supplier_invoices(*), supplier_payments(id, amount, currency, bank_reference, paid_at)",
      )
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("suppliers").select("id, name, region").eq("status", "approved").order("name"),
    hasPermission(actor, PERMISSIONS.DISPATCH_TRANSFER_SUPPLIER_INVOICE),
    hasPermission(actor, PERMISSIONS.DISPATCH_SEND_MANUAL),
  ]);

  if (!job) notFound();

  // Mirrors canDispatch() in app/(staff)/dispatch/actions.ts — owning the
  // job (it was created from a quote this user handled) is enough even
  // without the blanket dispatch.send_manual permission.
  const canDispatchJobs = job.created_by === actor.id || canDispatchManual;

  const allocationRows = (allocations ?? []) as unknown as JobAllocationRow[];
  const invoiceUrls: Record<string, string | null> = {};
  await Promise.all(
    allocationRows.map(async (a) => {
      if (!a.job_supplier_invoices) return;
      const { data: signed } = await supabase.storage
        .from("job-invoices")
        .createSignedUrl(a.job_supplier_invoices.storage_path, 3600);
      invoiceUrls[a.id] = signed?.signedUrl ?? null;
    }),
  );

  return (
    <DispatchJobDetail
      job={job as unknown as JobDetailRow}
      allocations={allocationRows}
      invoiceUrls={invoiceUrls}
      suppliers={(suppliers ?? []) as unknown as SupplierOption[]}
      canTransferInvoice={canTransfer}
      canDispatchJobs={canDispatchJobs}
    />
  );
}
