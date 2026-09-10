import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DispatchBoard, type JobRow } from "@/components/pages/DispatchBoard";

const PAGE_SIZE = 25;

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: jobs, count } = await supabase
    .from("jobs")
    .select(
      "id, status, region, quotes(quote_number, customers(company_name, contact_name)), job_allocations(id, status, suppliers(name))",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  return <DispatchBoard jobs={(jobs ?? []) as unknown as JobRow[]} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />;
}
