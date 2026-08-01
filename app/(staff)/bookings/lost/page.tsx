import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { healExpiredQuotes } from "@/lib/quoteExpiry";
import { BookingsLostPage, type LostBookingQuote } from "@/components/pages/BookingsLostPage";

export default async function Page() {
  await requireProfile();
  const supabase = await createClient();

  await healExpiredQuotes(supabase);

  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, currency, status, decided_at, expiry_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address, pickup_date)), quote_versions!quotes_current_version_id_fkey(selling_price), quote_decisions(decision, reason, free_text)",
    )
    .in("status", ["rejected", "expired"])
    .order("decided_at", { ascending: false, nullsFirst: false });

  return <BookingsLostPage quotes={(quotes ?? []) as unknown as LostBookingQuote[]} />;
}
