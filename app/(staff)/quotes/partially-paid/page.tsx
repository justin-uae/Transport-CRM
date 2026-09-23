import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PartiallyPaidQuotesPage, type PartiallyPaidQuoteRow } from "@/components/pages/PartiallyPaidQuotesPage";

const PAGE_SIZE = 25;

interface Payment {
  amount: number;
  verification_status: string;
}

/** Verified payments only (PAY-04 — a pending bank transfer doesn't count toward the balance yet), same rule used everywhere else money is totalled in this app. */
function verifiedPaid(payments: Payment[] | null): number {
  return (payments ?? []).filter((p) => p.verification_status === "verified").reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * Split out of Pending Quotes (app/(staff)/quotes/page.tsx) so a quote that's
 * had a partial payment doesn't sit mixed in with ones still awaiting any
 * payment at all. No manual "mine vs everyone's" filtering needed here —
 * quotes_select's RLS (can_view_assignment, 0002_sales_crm.sql) already
 * scopes the query to just the viewer's own quotes for a plain Sales User
 * (enquiries.view_own) and to every quote tenant-wide for anyone holding
 * enquiries.view_all (Master Admin, Sales Manager) — the exact split asked
 * for, already enforced at the database layer.
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
      "id, quote_number, currency, invoice_number, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address)), quote_versions!quotes_current_version_id_fkey(selling_price), profiles!quotes_created_by_fkey(full_name), customer_payments(amount, verification_status)",
      { count: "exact" },
    )
    .eq("status", "partially_paid");
  if (q) {
    listQuery = listQuery.or(`quote_number.ilike.%${q}%,invoice_number.ilike.%${q}%`);
  }

  // Second, unpaginated query just for the "Outstanding balance" KPI — the
  // page-sized `rows` below would silently understate it past PAGE_SIZE rows.
  const [{ data: rows, count }, { data: allRows }] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, to),
    supabase
      .from("quotes")
      .select("currency, quote_versions!quotes_current_version_id_fkey(selling_price), customer_payments(amount, verification_status)")
      .eq("status", "partially_paid"),
  ]);

  const quotes: PartiallyPaidQuoteRow[] = (rows ?? []).map((r) => {
    const paid = verifiedPaid(r.customer_payments);
    const sellingPrice = (r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0;
    return {
      id: r.id,
      quote_number: r.quote_number,
      currency: r.currency,
      invoice_number: r.invoice_number,
      customers: r.customers as unknown as PartiallyPaidQuoteRow["customers"],
      enquiries: r.enquiries as unknown as PartiallyPaidQuoteRow["enquiries"],
      quote_versions: r.quote_versions as unknown as PartiallyPaidQuoteRow["quote_versions"],
      profiles: r.profiles as unknown as PartiallyPaidQuoteRow["profiles"],
      paid,
      remaining: Math.max(0, sellingPrice - paid),
    };
  });

  const outstandingTotal = (allRows ?? []).reduce((sum, r) => {
    const sellingPrice = (r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0;
    return sum + Math.max(0, sellingPrice - verifiedPaid(r.customer_payments));
  }, 0);
  const outstandingCurrency = (allRows ?? [])[0]?.currency ?? "EUR";

  return (
    <PartiallyPaidQuotesPage
      quotes={quotes}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      outstandingTotal={outstandingTotal}
      outstandingCurrency={outstandingCurrency}
    />
  );
}
