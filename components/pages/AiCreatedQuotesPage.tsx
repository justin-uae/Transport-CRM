"use client";

import { Bot, Wallet } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { formatDateTime } from "@/lib/formatDate";
import type { QuoteStatus } from "@/lib/supabase/database.types";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_STYLE } from "@/lib/quoteStatus";

export interface AiCreatedQuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  created_at: string;
  sent_at: string | null;
  customers: { company_name: string | null; contact_name: string } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string }[] } | null;
  quote_versions: { selling_price: number; supplier_estimated_cost: number | null } | null;
}

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeyOf(q: AiCreatedQuoteRow) {
  return q.enquiries?.enquiry_legs?.[0] ?? null;
}

export function AiCreatedQuotesPage({
  quotes,
  page,
  pageSize,
  total,
  totalValue,
  totalCurrency,
}: {
  quotes: AiCreatedQuoteRow[];
  page: number;
  pageSize: number;
  total: number;
  totalValue: number;
  totalCurrency: string;
}) {
  return (
    <div>
      <Breadcrumb items={[{ label: "Pending Quotes", href: "/quotes" }, { label: "AI Created Quotes" }]} />
      <PageHead
        eyebrow="Sales Workspace"
        title="AI Created Quotes"
        text="Quotes Global Bus AI priced and sent automatically after a lead sat unquoted past the SLA (Settings -> AI Auto-Quote)."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Kpi title="AI-created quotes" value={String(total)} icon={Bot} />
        <Kpi title="Total value" value={money(totalValue, totalCurrency)} icon={Wallet} />
      </div>
      <Panel className="mt-6 min-w-0">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <SearchInput placeholder="Search by quote number" />
        </div>

        <div className="mt-4 space-y-3 sm:hidden">
          {quotes.map((q) => (
            <div key={q.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/quotes/${q.id}`} className="font-black text-primary-600 hover:underline">
                  {q.quote_number}
                </Link>
                <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + QUOTE_STATUS_STYLE[q.status]}>
                  {QUOTE_STATUS_LABEL[q.status]}
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</div>
              <div className="mt-1 text-sm text-slate-600">
                <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} maxWidth="100%" />
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-slate-500">Selling price</span>
                <b>{money(q.quote_versions?.selling_price, q.currency)}</b>
              </div>
              <div className="mt-1 text-xs text-slate-400">{q.sent_at ? `Sent ${formatDateTime(q.sent_at)}` : "Not sent yet"}</div>
              <Link
                href={`/quotes/${q.id}`}
                className="mt-3 block w-full rounded-lg border border-primary-300 px-3 py-2 text-center text-xs font-bold text-primary-700"
              >
                View
              </Link>
            </div>
          ))}
          {quotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No AI-created quotes yet.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-3 py-4">Quote</th>
                <th className="px-3 py-4">Customer</th>
                <th className="px-3 py-4">Journey</th>
                <th className="px-3 py-4">Status</th>
                <th className="px-3 py-4">Selling price</th>
                <th className="px-3 py-4">Sent</th>
                <th className="px-3 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-4 font-black text-primary-600">
                    <Link href={`/quotes/${q.id}`} className="hover:underline">
                      {q.quote_number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</td>
                  <td className="px-3 py-4 text-slate-600">
                    <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + QUOTE_STATUS_STYLE[q.status]}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-bold">{money(q.quote_versions?.selling_price, q.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-500">{q.sent_at ? formatDateTime(q.sent_at) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">
                    <Link
                      href={`/quotes/${q.id}`}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No AI-created quotes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>
    </div>
  );
}
