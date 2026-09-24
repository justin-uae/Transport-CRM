import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { LeadDetailPage, type LeadDetail, type LeadDetailQuote, type LeadSourceDocument } from "@/components/pages/LeadDetailPage";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import type { JourneyLeg } from "@/components/pages/JourneyLegDetail";
import type { LeadEditRecord } from "@/components/pages/LeadEditHistory";
import type { LeadAssignmentEvent } from "@/components/pages/LeadAssignmentHistory";

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
      "id, status, enquiry_legs(id, sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))",
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

  let sourceDocument: LeadSourceDocument | null = null;
  if (lead.is_complex_booking) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_name, storage_path")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (doc) {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600);
      sourceDocument = { fileName: doc.file_name, downloadUrl: signed?.signedUrl ?? null };
    }
  }

  const [canAddEnquiry, canClaim, canRelease, canEditCustomer, canAssign, canViewAuditLog, { data: editsRaw }] = await Promise.all([
    hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_EDIT),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN),
    hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS),
    supabase.from("lead_edits").select("id, reason, changes, created_at, profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);

  // Only fetched for someone who can actually use it — the dropdown of
  // sales users a lead can be handed to.
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  // audit_log's own select policy is gated on admin.view_audit_logs
  // tenant-wide (Master Admin, Sales Manager, Finance Manager) — querying it
  // for anyone else would just come back empty anyway, so skip the round trip.
  const assignmentEvents = canViewAuditLog
    ? ((
        await supabase
          .from("audit_log")
          .select("id, action, new_value, created_at, actor:profiles!audit_log_actor_id_fkey(full_name)")
          .eq("entity_type", "lead")
          .eq("entity_id", id)
          .in("action", ["lead_assigned_by_manager", "lead_claimed", "lead_released", "lead_released_sla_breach"])
          .order("created_at", { ascending: false })
      ).data ?? [])
    : [];

  return (
    <LeadDetailPage
      lead={lead as unknown as LeadDetail}
      legs={(enquiry?.enquiry_legs ?? []) as unknown as JourneyLeg[]}
      enquiryId={enquiry?.id ?? null}
      quote={quote}
      sourceDocument={sourceDocument}
      edits={(editsRaw ?? []) as unknown as LeadEditRecord[]}
      assignmentEvents={assignmentEvents as unknown as LeadAssignmentEvent[]}
      currentUserId={profile.id}
      canAddEnquiry={canAddEnquiry}
      canClaim={canClaim}
      canRelease={canRelease}
      canEditCustomer={canEditCustomer}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
    />
  );
}
