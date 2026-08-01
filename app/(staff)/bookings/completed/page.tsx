import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookingsCompletedPage, type CompletedBookingJob } from "@/components/pages/BookingsCompletedPage";

const PAGE_SIZE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: jobs, count } = await supabase
    .from("jobs")
    .select(
      "id, status, region, completed_at, quotes(quote_number, currency, customers(company_name, contact_name), quote_versions!quotes_current_version_id_fkey(selling_price)), suppliers(name)",
      { count: "exact" },
    )
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .range(from, to);

  return (
    <BookingsCompletedPage
      jobs={(jobs ?? []) as unknown as CompletedBookingJob[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
    />
  );
}
