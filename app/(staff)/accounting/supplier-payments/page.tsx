import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SupplierPaymentsPage, type SupplierInvoiceRow } from "@/components/pages/SupplierPaymentsPage";

export default async function Page() {
  const profile = await requireProfile();
  const canPay = await hasPermission(profile, PERMISSIONS.FINANCE_PAY_SUPPLIERS);
  if (!canPay) redirect("/dashboard");

  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("job_supplier_invoices")
    .select(
      "id, job_id, amount, currency, notes, file_name, storage_path, forwarded_at, jobs(id, status, supplier_payment_status, region, suppliers(id, name, phone, email), quotes(quote_number, customers(company_name, contact_name)), supplier_payments(amount, bank_reference, notes, paid_at))",
    )
    .eq("status", "forwarded_to_accounting")
    .order("forwarded_at", { ascending: false });

  const rows = (invoices ?? []) as unknown as SupplierInvoiceRow[];

  const signedUrls = await Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage.from("job-invoices").createSignedUrl(row.storage_path, 3600);
      return { id: row.id, url: data?.signedUrl ?? null };
    }),
  );
  const urlById = new Map(signedUrls.map((s) => [s.id, s.url]));

  return <SupplierPaymentsPage invoices={rows} invoiceUrls={Object.fromEntries(urlById)} />;
}
