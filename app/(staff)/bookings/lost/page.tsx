import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { healExpiredQuotes } from "@/lib/quoteExpiry";
import { healExpiredLeads } from "@/lib/leadExpiry";
import { BookingsLostPage, type ExpiredLead, type LostBookingQuote } from "@/components/pages/BookingsLostPage";

export default async function Page() {
  await requireProfile();
  const supabase = await createClient();

  await Promise.all([healExpiredQuotes(supabase), healExpiredLeads(supabase)]);

  const { data: expiredLeads } = await supabase
    .from("leads")
    .select(
      "id, pickup_text, destination_text, travel_date, pickup_time, passenger_count, notes, created_at, customers(company_name, contact_name), profiles(full_name)",
    )
    .eq("status", "expired")
    .order("travel_date", { ascending: false });

  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, currency, status, decided_at, expiry_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address, pickup_date)), quote_versions!quotes_current_version_id_fkey(selling_price), quote_decisions(decision, reason, free_text), profiles!quotes_created_by_fkey(full_name)",
    )
    .in("status", ["rejected", "expired", "cancelled"])
    .order("decided_at", { ascending: false, nullsFirst: false });

  return (
    <BookingsLostPage
      quotes={(quotes ?? []) as unknown as LostBookingQuote[]}
      expiredLeads={(expiredLeads ?? []) as unknown as ExpiredLead[]}
    />
  );
}
