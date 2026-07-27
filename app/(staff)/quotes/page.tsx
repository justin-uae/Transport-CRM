import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuotesPage, type QuoteRow } from "@/components/pages/QuotesPage";

export default async function Page() {
  await requireProfile();
  const supabase = await createClient();

  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, invoice_number, public_token, created_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address)), quote_versions!quotes_current_version_id_fkey(selling_price)",
    )
    .order("created_at", { ascending: false });

  return <QuotesPage quotes={(quotes ?? []) as unknown as QuoteRow[]} />;
}
