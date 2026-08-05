import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGbpRates } from "@/lib/fxRates";
import type { Database } from "@/lib/supabase/database.types";

export interface BankTransferQueueItem {
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  balance: number;
  currency: string;
}

export interface AccountingSummary {
  collectedRevenueGbp: number;
  outstandingGbp: number;
  outstandingCount: number;
  grossProfitGbp: number;
  grossProfitMarginPct: number | null;
  supplierPayableGbp: number;
  supplierPayableCount: number;
  bankTransferQueue: BankTransferQueueItem[];
  receivablesAgeing: { n: string; v: number }[];
}

interface QuoteRow {
  id: string;
  quote_number: string;
  status: string;
  currency: string;
  decided_at: string | null;
  customers: { company_name: string | null; contact_name: string } | null;
  quote_versions: { selling_price: number; supplier_estimated_cost: number | null } | null;
  customer_payments: { amount: number; paid_at: string }[] | null;
}

interface SupplierInvoiceRow {
  id: string;
  amount: number;
  currency: string;
  supplier_payments: { amount: number }[] | null;
}

/**
 * Converts to GBP using the same cached rate table as lib/quoteMoney.ts /
 * lib/fxRates.ts (the existing single-currency convention this app already
 * uses for cross-currency comparisons, e.g. the Stripe-vs-bank-transfer
 * threshold). If a quote/invoice was priced in a currency the free-tier rate
 * source doesn't cover, its amount is added at face value rather than
 * dropped — a KPI should never silently under-count, even if an exotic
 * currency can't be precisely converted.
 */
function toGbp(amount: number, currency: string, rates: Record<string, number>): number {
  const code = currency.toUpperCase();
  if (code === "GBP") return amount;
  const rate = rates[code];
  if (!rate) return amount;
  return amount / rate;
}

function startOfMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getAccountingSummary(
  supabase: SupabaseClient<Database>,
): Promise<AccountingSummary> {
  const [{ data: quoteRows }, { data: invoiceRows }, rates] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, currency, decided_at, customers(company_name, contact_name), quote_versions!quotes_current_version_id_fkey(selling_price, supplier_estimated_cost), customer_payments(amount, paid_at)",
      )
      .in("status", ["accepted", "partially_paid", "paid"]),
    supabase
      .from("job_supplier_invoices")
      .select("id, amount, currency, supplier_payments(amount)")
      .eq("status", "forwarded_to_accounting"),
    getGbpRates().catch(() => ({}) as Record<string, number>),
  ]);

  const quotes = (quoteRows ?? []) as unknown as QuoteRow[];
  const invoices = (invoiceRows ?? []) as unknown as SupplierInvoiceRow[];
  const monthStart = startOfMonth();

  let collectedRevenueGbp = 0;
  let outstandingGbp = 0;
  let outstandingCount = 0;
  let grossProfitGbp = 0;
  let paidRevenueGbp = 0;
  const bankTransferQueue: BankTransferQueueItem[] = [];
  const ageingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61plus: 0 };

  for (const q of quotes) {
    const paidSoFar = (q.customer_payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

    for (const p of q.customer_payments ?? []) {
      if (p.paid_at >= monthStart) {
        collectedRevenueGbp += toGbp(Number(p.amount), q.currency, rates);
      }
    }

    if (q.status === "accepted" || q.status === "partially_paid") {
      const sellingPrice = q.quote_versions?.selling_price ?? 0;
      const balance = Math.max(0, sellingPrice - paidSoFar);
      const balanceGbp = toGbp(balance, q.currency, rates);
      outstandingGbp += balanceGbp;
      outstandingCount += 1;

      bankTransferQueue.push({
        quoteId: q.id,
        quoteNumber: q.quote_number,
        customerName: q.customers?.company_name || q.customers?.contact_name || "—",
        balance,
        currency: q.currency,
      });

      const ageDays = q.decided_at
        ? Math.floor((Date.now() - new Date(q.decided_at).getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      if (ageDays <= 0) ageingBuckets.current += balanceGbp;
      else if (ageDays <= 30) ageingBuckets.d1_30 += balanceGbp;
      else if (ageDays <= 60) ageingBuckets.d31_60 += balanceGbp;
      else ageingBuckets.d61plus += balanceGbp;
    }

    if (q.status === "paid" && q.decided_at && q.decided_at >= monthStart && q.quote_versions) {
      const sellingPriceGbp = toGbp(q.quote_versions.selling_price, q.currency, rates);
      const costGbp = toGbp(q.quote_versions.supplier_estimated_cost ?? 0, q.currency, rates);
      grossProfitGbp += sellingPriceGbp - costGbp;
      paidRevenueGbp += sellingPriceGbp;
    }
  }

  let supplierPayableGbp = 0;
  let supplierPayableCount = 0;
  for (const inv of invoices) {
    const paid = (inv.supplier_payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    const balance = Math.max(0, Number(inv.amount) - paid);
    if (balance > 0) {
      supplierPayableGbp += toGbp(balance, inv.currency, rates);
      supplierPayableCount += 1;
    }
  }

  bankTransferQueue.sort((a, b) => b.balance - a.balance);

  return {
    collectedRevenueGbp,
    outstandingGbp,
    outstandingCount,
    grossProfitGbp,
    grossProfitMarginPct: paidRevenueGbp > 0 ? (grossProfitGbp / paidRevenueGbp) * 100 : null,
    supplierPayableGbp,
    supplierPayableCount,
    bankTransferQueue: bankTransferQueue.slice(0, 8),
    receivablesAgeing: [
      { n: "Current", v: Math.round(ageingBuckets.current) },
      { n: "1–30", v: Math.round(ageingBuckets.d1_30) },
      { n: "31–60", v: Math.round(ageingBuckets.d31_60) },
      { n: "61+", v: Math.round(ageingBuckets.d61plus) },
    ],
  };
}
