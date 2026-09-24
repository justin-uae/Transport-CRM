"use client";

import { Wallet } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export interface PartiallyPaidQuoteRow {
  id: string;
  quote_number: string;
  currency: string;
  invoice_number: string | null;
  customers: { company_name: string | null; contact_name: string } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string }[] } | null;
  quote_versions: { selling_price: number } | null;
  profiles: { full_name: string } | null;
  paid: number;
  remaining: number;
}

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeyOf(q: PartiallyPaidQuoteRow) {
  return q.enquiries?.enquiry_legs?.[0] ?? null;
}

export function PartiallyPaidQuotesPage({
  quotes,
  page,
  pageSize,
  total,
  outstandingTotal,
  outstandingCurrency,
}: {
  quotes: PartiallyPaidQuoteRow[];
  page: number;
  pageSize: number;
  total: number;
  outstandingTotal: number;
  outstandingCurrency: string;
}) {
  return (
    <div>
      <Breadcrumb items={[{ label: "Pending Quotes", href: "/quotes" }, { label: "Partially Paid" }]} />
      <PageHead
        eyebrow="Sales Workspace"
        title="Partially Paid"
        text="Quotes with a deposit or part-payment in, still waiting on the rest of the balance."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Kpi title="Partially paid quotes" value={String(total)} icon={Wallet} />
        <Kpi title="Outstanding balance" value={money(outstandingTotal, outstandingCurrency)} icon={Wallet} />
      </div>
      <Panel className="mt-6 min-w-0">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <SearchInput placeholder="Search quotes (number or invoice)" />
        </div>

        <div className="mt-4 space-y-3 sm:hidden">
          {quotes.map((q) => (
            <div key={q.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/quotes/${q.id}`} className="font-black text-primary-600 hover:underline">
                    {q.quote_number}
                  </Link>
                  {q.invoice_number && <div className="text-xs text-slate-400">Inv {q.invoice_number}</div>}
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Partially paid</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</div>
              <div className="mt-1 text-sm text-slate-600">
                <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} maxWidth="100%" />
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-slate-500">Paid</span>
                <b>{money(q.paid, q.currency)}</b>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Remaining</span>
                <b className="text-amber-700">{money(q.remaining, q.currency)}</b>
              </div>
              <div className="mt-1 text-xs text-slate-400">Sales rep: {q.profiles?.full_name || "—"}</div>
              <Link
                href={`/quotes/${q.id}`}
                className="mt-3 block w-full rounded-lg border border-primary-300 px-3 py-2 text-center text-xs font-bold text-primary-700"
              >
                View
              </Link>
            </div>
          ))}
          {quotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No partially paid quotes right now.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-3 py-4">Quote</th>
                <th className="px-3 py-4">Customer</th>
                <th className="px-3 py-4">Journey</th>
                <th className="px-3 py-4">Sales Rep</th>
                <th className="px-3 py-4">Paid</th>
                <th className="px-3 py-4">Remaining</th>
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
                    {q.invoice_number && <div className="text-xs font-normal text-slate-400">Inv {q.invoice_number}</div>}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-4 font-semibold" title={q.customers?.company_name || q.customers?.contact_name || undefined}>
                    {q.customers?.company_name || q.customers?.contact_name || "—"}
                  </td>
                  <td className="px-3 py-4 text-slate-600">
                    <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{q.profiles?.full_name || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-bold text-emerald-700">{money(q.paid, q.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-black text-amber-700">{money(q.remaining, q.currency)}</td>
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
                    No partially paid quotes right now.
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
