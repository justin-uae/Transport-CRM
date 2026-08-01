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
      "id, quote_number, status, currency, decided_at, invoice_number, invoiced_at, payment_proof_storage_path, customers(company_name, contact_name, phone, email), enquiries(enquiry_legs(pickup_address, destination_address, pickup_date)), quote_versions!quote_versions_quote_id_fkey(selling_price)",
    )
    .in("status", ["accepted", "paid"])
    .order("decided_at", { ascending: false });

  const rows = (quotes ?? []) as unknown as (AcceptedQuoteRow & { payment_proof_storage_path: string | null })[];

  const signedProofUrls = await Promise.all(
    rows
      .filter((q) => q.payment_proof_storage_path)
      .map(async (q) => {
        const { data } = await supabase.storage
          .from("customer-payment-proofs")
          .createSignedUrl(q.payment_proof_storage_path as string, 3600);
        return { id: q.id, url: data?.signedUrl ?? null };
      }),
  );
  const proofUrls = Object.fromEntries(signedProofUrls.map((s) => [s.id, s.url]));

  return <CustomerPaymentsPage quotes={rows} proofUrls={proofUrls} currentUserId={profile.id} />;
}
