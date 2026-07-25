import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { LeadsPage, type LeadRow } from "@/components/pages/LeadsPage";

export default async function Page() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: leads }, { data: openEnquiries }, { data: openQuotes }, canAddEnquiry] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, source, status, priority, pickup_text, destination_text, travel_date, passenger_count, assigned_user_id, created_at, customers(company_name, contact_name), profiles(full_name), territories(label)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("enquiries")
      .select("id, status")
      .eq("assigned_user_id", profile.id)
      .not("status", "in", "(completed,cancelled,declined,converted_to_booking)"),
    supabase
      .from("quotes")
      .select("id, status, enquiries(assigned_user_id)")
      .in("status", ["sent", "viewed"]),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
  ]);

  const quotesAwaitingResponse = (openQuotes ?? []).filter(
    (q) => (q.enquiries as unknown as { assigned_user_id: string | null } | null)?.assigned_user_id === profile.id,
  ).length;

  return (
    <LeadsPage
      leads={(leads ?? []) as unknown as LeadRow[]}
      currentUserId={profile.id}
      myOpenEnquiries={openEnquiries?.length ?? 0}
      quotesAwaitingResponse={quotesAwaitingResponse}
      canAddEnquiry={canAddEnquiry}
    />
  );
}
