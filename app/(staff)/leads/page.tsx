import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { healExpiredLeads } from "@/lib/leadExpiry";
import { LeadsPage, type LeadRow, type LeadTab } from "@/components/pages/LeadsPage";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";

const PAGE_SIZE = 25;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  await healExpiredLeads(supabase);

  const tab: LeadTab = params.tab === "pool" || params.tab === "all" || params.tab === "quoted" ? params.tab : "mine";
  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("leads")
    .select(
      "id, source, status, priority, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, is_complex_booking, vehicle_requested, notes, assigned_user_id, created_at, customers(company_name, contact_name, phone, email), profiles(full_name), brands(name), enquiries(quotes(ai_generated))",
      { count: "exact" },
    );

  // "converted" (lead.status flips the moment quotes/new actually creates a
  // quote from it — app/(staff)/quotes/new/actions.ts) is excluded from
  // "mine" and given its own "Quoted" tab instead, so a lead already turned
  // into a quote doesn't sit mixed in with ones still needing work.
  if (tab === "mine") {
    listQuery = listQuery.eq("assigned_user_id", profile.id).not("status", "in", "(closed,converted)");
  } else if (tab === "pool") {
    listQuery = listQuery.eq("status", "open_pool");
  } else if (tab === "quoted") {
    listQuery = listQuery.eq("assigned_user_id", profile.id).eq("status", "converted");
  }
  if (q) {
    listQuery = listQuery.or(`pickup_text.ilike.%${q}%,destination_text.ilike.%${q}%,notes.ilike.%${q}%`);
  }

  const [
    { data: leads, count },
    { count: mineCount },
    { count: poolCount },
    { count: quotedCount },
    { data: openEnquiries },
    { count: openQuotesCount },
    canAddEnquiry,
    canClaim,
    canRelease,
    canViewAll,
    canAssign,
  ] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, to),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_user_id", profile.id)
      .not("status", "in", "(closed,converted)"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "open_pool"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_user_id", profile.id)
      .eq("status", "converted"),
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
    hasPermission(profile, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_VIEW_ALL).then(
      async (viewAll) => viewAll || (await hasPermission(profile, PERMISSIONS.ENQUIRIES_VIEW_TEAM)),
    ),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN),
  ]);

  const quotesAwaitingResponse = openQuotesCount ?? 0;
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  // A lead the AI Auto-Quote sweep converted has no assigned_user_id (it
  // was released to the pool before being quoted, see lib/aiAutoQuote.ts) —
  // without this, the Owner column would otherwise read it as still sitting
  // unclaimed in the open pool instead of already quoted by AI.
  const leadRows = (leads ?? []).map((l) => {
    const enquiries = (l as unknown as { enquiries: { quotes: { ai_generated: boolean }[] }[] | null }).enquiries ?? [];
    const aiQuoted = enquiries.some((e) => e.quotes?.some((q) => q.ai_generated));
    return { ...l, ai_quoted: aiQuoted } as unknown as LeadRow;
  });

  return (
    <LeadsPage
      leads={leadRows}
      currentUserId={profile.id}
      myOpenEnquiries={openEnquiries?.length ?? 0}
      quotesAwaitingResponse={quotesAwaitingResponse}
      canAddEnquiry={canAddEnquiry}
      canClaim={canClaim}
      canRelease={canRelease}
      canViewAll={canViewAll}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
      tab={tab}
      mineCount={mineCount ?? 0}
      poolCount={poolCount ?? 0}
      quotedCount={quotedCount ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
    />
  );
}
