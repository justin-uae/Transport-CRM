import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { healExpiredQuotes } from "@/lib/quoteExpiry";
import { QuotesPage, type QuoteRow } from "@/components/pages/QuotesPage";

const PAGE_SIZE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  await healExpiredQuotes(supabase);

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Pending Quotes covers everything up to customer payment — draft/sent/
  // viewed (no decision yet) and accepted (decided, but not yet paid at
  // all). A quote that's had a partial payment moves to its own Partially
  // Paid tab (/quotes/partially-paid) instead of staying listed here. Once
  // fully paid a job gets created and the booking moves to the Confirmed
  // Booking tab; rejected/expired move to Lost Booking.
  let listQuery = supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, invoice_number, public_token, created_at, sent_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address)), quote_versions!quotes_current_version_id_fkey(selling_price), profiles!quotes_created_by_fkey(full_name)",
      { count: "exact" },
    )
    .in("status", ["draft", "sent", "viewed", "accepted"]);
  if (q) {
    listQuery = listQuery.or(`quote_number.ilike.%${q}%,invoice_number.ilike.%${q}%`);
  }

  // The 4 separate count queries + the pipeline-value query this page used
  // to fire were each independently re-running the same per-row RLS check
  // (can_view_assignment) across the whole quotes table — 5 full passes
  // instead of 1. Fetching status + selling_price once and deriving every
  // KPI from that single result set cuts this page from 7 concurrent
  // queries to 3, which is what was pushing Postgres into a statement
  // timeout (57014) under load.
  const [{ data: quotes, count }, canCreateQuote, { data: statsRows }] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, to),
    hasPermission(profile, PERMISSIONS.QUOTES_CREATE),
    supabase.from("quotes").select("status, currency, quote_versions!quotes_current_version_id_fkey(selling_price)"),
  ]);

  const rows = statsRows ?? [];
  const draftCount = rows.filter((r) => r.status === "draft").length;
  const sentRows = rows.filter((r) => r.status === "sent" || r.status === "viewed");
  const sentCount = sentRows.length;
  const acceptedCount = rows.filter((r) => r.status === "accepted" || r.status === "converted").length;
  const totalCount = rows.length;

  const pipelineValue = sentRows.reduce(
    (sum, r) => sum + ((r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0),
    0,
  );
  const pipelineCurrency = sentRows[0]?.currency ?? "EUR";

  return (
    <QuotesPage
      quotes={(quotes ?? []) as unknown as QuoteRow[]}
      canCreateQuote={canCreateQuote}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      draftCount={draftCount}
      sentCount={sentCount}
      acceptedCount={acceptedCount}
      totalCount={totalCount}
      pipelineValue={pipelineValue}
      pipelineCurrency={pipelineCurrency}
    />
  );
}
