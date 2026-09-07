import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { LeadDetailPage, type LeadDetail, type LeadDetailQuote } from "@/components/pages/LeadDetailPage";
import type { JourneyLeg } from "@/components/pages/JourneyLegDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, source, status, priority, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, is_complex_booking, vehicle_requested, notes, assigned_user_id, created_at, customer_id, customers(id, company_name, contact_name, phone, email), profiles(full_name), brands(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  const { data: enquiry } = await supabase
    .from("enquiries")
    .select(
      "id, status, enquiry_legs(sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))",
    )
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let quote: LeadDetailQuote | null = null;
  if (enquiry) {
    const { data: quoteRow } = await supabase
      .from("quotes")
      .select("id, quote_number, status")
      .eq("enquiry_id", enquiry.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    quote = quoteRow;
  }

  const [canAddEnquiry, canClaim, canRelease] = await Promise.all([
    hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL),
  ]);

  return (
    <LeadDetailPage
      lead={lead as unknown as LeadDetail}
      legs={(enquiry?.enquiry_legs ?? []) as unknown as JourneyLeg[]}
      enquiryId={enquiry?.id ?? null}
      quote={quote}
      currentUserId={profile.id}
      canAddEnquiry={canAddEnquiry}
      canClaim={canClaim}
      canRelease={canRelease}
    />
  );
}
