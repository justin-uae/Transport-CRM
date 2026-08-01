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
  // viewed (no decision yet) and accepted (decided, but not yet marked paid
  // by staff). Only once paid does a job get created and the booking moves
  // to the Confirmed Booking tab; rejected/expired move to Lost Booking.
  let listQuery = supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, invoice_number, public_token, created_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address)), quote_versions!quotes_current_version_id_fkey(selling_price)",
      { count: "exact" },
    )
    .in("status", ["draft", "sent", "viewed", "accepted", "partially_paid"]);
  if (q) {
    listQuery = listQuery.or(`quote_number.ilike.%${q}%,invoice_number.ilike.%${q}%`);
  }

  const [
    { data: quotes, count },
    canCreateQuote,
    { count: draftCount },
    { count: sentCount },
    { count: acceptedCount },
    { count: totalCount },
    { data: pipelineRows },
  ] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, to),
    hasPermission(profile, PERMISSIONS.QUOTES_CREATE),
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("quotes").select("id", { count: "exact", head: true }).in("status", ["sent", "viewed"]),
    supabase.from("quotes").select("id", { count: "exact", head: true }).in("status", ["accepted", "partially_paid", "converted"]),
    supabase.from("quotes").select("id", { count: "exact", head: true }),
    supabase
      .from("quotes")
      .select("currency, quote_versions!quotes_current_version_id_fkey(selling_price)")
      .in("status", ["sent", "viewed"]),
  ]);

  const pipelineValue = (pipelineRows ?? []).reduce(
    (sum, r) => sum + ((r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0),
    0,
  );
  const pipelineCurrency = (pipelineRows ?? [])[0]?.currency ?? "EUR";

  return (
    <QuotesPage
      quotes={(quotes ?? []) as unknown as QuoteRow[]}
      canCreateQuote={canCreateQuote}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      draftCount={draftCount ?? 0}
      sentCount={sentCount ?? 0}
      acceptedCount={acceptedCount ?? 0}
      totalCount={totalCount ?? 0}
      pipelineValue={pipelineValue}
      pipelineCurrency={pipelineCurrency}
    />
  );
}
