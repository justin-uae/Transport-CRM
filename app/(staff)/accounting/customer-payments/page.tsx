import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { CustomerPaymentsPage, type AcceptedQuoteRow } from "@/components/pages/CustomerPaymentsPage";

export default async function Page() {
  const profile = await requireProfile();
  const canMarkPaid = await hasPermission(profile, PERMISSIONS.FINANCE_RECORD_PAYMENTS);
  if (!canMarkPaid) redirect("/dashboard");

  const supabase = await createClient();

  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, decided_at, invoice_number, invoiced_at, customers(company_name, contact_name, phone, email), enquiries(enquiry_legs(pickup_address, destination_address, pickup_date)), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage), customer_payments(id, amount, method, paid_at, proof_storage_path)",
    )
    .in("status", ["accepted", "partially_paid", "paid"])
    .order("decided_at", { ascending: false });

  const rows = (quotes ?? []) as unknown as AcceptedQuoteRow[];

  const signedProofUrls = await Promise.all(
    rows
      .flatMap((q) => q.customer_payments ?? [])
      .filter((p) => p.proof_storage_path)
      .map(async (p) => {
        const { data } = await supabase.storage
          .from("customer-payment-proofs")
          .createSignedUrl(p.proof_storage_path as string, 3600);
        return { id: p.id, url: data?.signedUrl ?? null };
      }),
  );
  const proofUrls = Object.fromEntries(signedProofUrls.map((s) => [s.id, s.url]));

  return <CustomerPaymentsPage quotes={rows} proofUrls={proofUrls} currentUserId={profile.id} />;
}
