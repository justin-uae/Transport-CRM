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
      "id, job_id, amount, currency, notes, file_name, storage_path, forwarded_at, jobs(id, status, supplier_payment_status, region, suppliers(id, name, phone, email), quotes(quote_number, customers(company_name, contact_name)), supplier_payments(id, amount, bank_reference, notes, paid_at, proof_storage_path))",
    )
    .eq("status", "forwarded_to_accounting")
    .order("forwarded_at", { ascending: false });

  const rows = (invoices ?? []) as unknown as SupplierInvoiceRow[];

  const signedInvoiceUrls = await Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage.from("job-invoices").createSignedUrl(row.storage_path, 3600);
      return { id: row.id, url: data?.signedUrl ?? null };
    }),
  );
  const invoiceUrlById = new Map(signedInvoiceUrls.map((s) => [s.id, s.url]));

  const proofPaths = rows.flatMap((row) =>
    (row.jobs?.supplier_payments ?? [])
      .filter((p) => p.proof_storage_path)
      .map((p) => ({ id: p.id, path: p.proof_storage_path as string })),
  );
  const signedProofUrls = await Promise.all(
    proofPaths.map(async ({ id, path }) => {
      const { data } = await supabase.storage.from("supplier-payment-proofs").createSignedUrl(path, 3600);
      return { id, url: data?.signedUrl ?? null };
    }),
  );
  const proofUrlById = new Map(signedProofUrls.map((s) => [s.id, s.url]));

  return (
    <SupplierPaymentsPage
      invoices={rows}
      invoiceUrls={Object.fromEntries(invoiceUrlById)}
      proofUrls={Object.fromEntries(proofUrlById)}
      currentUserId={profile.id}
    />
  );
}
