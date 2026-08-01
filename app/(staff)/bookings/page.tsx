import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookingsConfirmedPage, type ConfirmedBookingJob } from "@/components/pages/BookingsConfirmedPage";

const legsSelect = "enquiries(enquiry_legs(pickup_address, destination_address, pickup_date))";
const versionSelect = "quote_versions!quotes_current_version_id_fkey(selling_price)";

export default async function Page() {
  await requireProfile();
  const supabase = await createClient();

  // Jobs only exist once a quote has been marked paid — so this list is
  // naturally scoped to "payment confirmed" bookings already, through to
  // job completion (completed jobs move to the Completed Booking tab).
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `id, status, region, created_at, quotes(quote_number, currency, customers(company_name, contact_name), ${legsSelect}, ${versionSelect}), suppliers(name)`,
    )
    .in("status", ["unassigned", "offered", "accepted_by_supplier", "confirmed"])
    .order("created_at", { ascending: false });

  return <BookingsConfirmedPage jobs={(jobs ?? []) as unknown as ConfirmedBookingJob[]} />;
}
