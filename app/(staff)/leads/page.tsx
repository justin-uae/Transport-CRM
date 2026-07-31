import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { LeadsPage, type LeadRow, type LeadTab } from "@/components/pages/LeadsPage";

const PAGE_SIZE = 25;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const tab: LeadTab = params.tab === "pool" || params.tab === "all" ? params.tab : "mine";
  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("leads")
    .select(
      "id, source, status, priority, pickup_text, destination_text, travel_date, passenger_count, vehicle_requested, notes, assigned_user_id, created_at, customers(company_name, contact_name, phone, email), profiles(full_name)",
      { count: "exact" },
    );

  if (tab === "mine") {
    listQuery = listQuery.eq("assigned_user_id", profile.id).neq("status", "closed");
  } else if (tab === "pool") {
    listQuery = listQuery.eq("status", "open_pool");
  }
  if (q) {
    listQuery = listQuery.or(`pickup_text.ilike.%${q}%,destination_text.ilike.%${q}%,notes.ilike.%${q}%`);
  }

  const [{ data: leads, count }, { count: mineCount }, { count: poolCount }, { data: openEnquiries }, { count: openQuotesCount }, canAddEnquiry] =
    await Promise.all([
      listQuery.order("created_at", { ascending: false }).range(from, to),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_user_id", profile.id)
        .neq("status", "closed"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "open_pool"),
      supabase
        .from("enquiries")
        .select("id, status")
        .eq("assigned_user_id", profile.id)
        .not("status", "in", "(completed,cancelled,declined,converted_to_booking)"),
      // Pushed the assigned_user_id filter into the query (via the !inner
      // join on enquiries) and made it a head:true count instead of pulling
      // every sent/viewed quote in the tenant just to filter+count it in JS.
      supabase
        .from("quotes")
        .select("id, enquiries!inner(assigned_user_id)", { count: "exact", head: true })
        .in("status", ["sent", "viewed"])
        .eq("enquiries.assigned_user_id", profile.id),
      hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
    ]);

  const quotesAwaitingResponse = openQuotesCount ?? 0;

  return (
    <LeadsPage
      leads={(leads ?? []) as unknown as LeadRow[]}
      currentUserId={profile.id}
      myOpenEnquiries={openEnquiries?.length ?? 0}
      quotesAwaitingResponse={quotesAwaitingResponse}
      canAddEnquiry={canAddEnquiry}
      tab={tab}
      mineCount={mineCount ?? 0}
      poolCount={poolCount ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
    />
  );
}
