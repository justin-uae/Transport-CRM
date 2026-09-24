import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AiCreatedQuotesPage, type AiCreatedQuoteRow } from "@/components/pages/AiCreatedQuotesPage";

const PAGE_SIZE = 25;

/**
 * Everything lib/aiAutoQuote.ts has priced and sent on its own — split out
 * from Pending Quotes so staff can review what went out automatically
 * without hunting for it. Visibility follows quotes_select's RLS
 * (can_view_assignment) same as Partially Paid: an AI-quoted lead has no
 * assigned_user_id (it was released to the pool before being quoted), so a
 * plain Sales User (enquiries.view_own) sees none of these — only
 * enquiries.view_all holders (Master Admin, Sales Manager) do.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, created_at, sent_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address)), quote_versions!quotes_current_version_id_fkey(selling_price, supplier_estimated_cost)",
      { count: "exact" },
    )
    .eq("ai_generated", true);
  if (q) {
    listQuery = listQuery.ilike("quote_number", `%${q}%`);
  }

  const [{ data: quotes, count }, { data: allRows }] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, to),
    supabase
      .from("quotes")
      .select("currency, quote_versions!quotes_current_version_id_fkey(selling_price)")
      .eq("ai_generated", true),
  ]);

  const totalValue = (allRows ?? []).reduce(
    (sum, r) => sum + ((r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0),
    0,
  );
  const totalCurrency = (allRows ?? [])[0]?.currency ?? "EUR";

  return (
    <AiCreatedQuotesPage
      quotes={(quotes ?? []) as unknown as AiCreatedQuoteRow[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      totalValue={totalValue}
      totalCurrency={totalCurrency}
    />
  );
}
