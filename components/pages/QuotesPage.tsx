"use client";

import { Send, CheckCircle2, Timer, FileText } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import type { QuoteStatus } from "@/lib/supabase/database.types";

export interface QuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  invoice_number: string | null;
  public_token: string;
  created_at: string;
  customers: { company_name: string | null; contact_name: string } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string }[] } | null;
  quote_versions: { selling_price: number } | null;
}

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-50 text-blue-700",
  viewed: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  converted: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
};

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeyOf(q: QuoteRow) {
  const leg = q.enquiries?.enquiry_legs?.[0];
  return leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—";
}

export function QuotesPage({
  quotes,
  canCreateQuote,
  page,
  pageSize,
  total,
  draftCount,
  sentCount,
  acceptedCount,
  totalCount,
  pipelineValue,
  pipelineCurrency,
}: {
  quotes: QuoteRow[];
  canCreateQuote: boolean;
  page: number;
  pageSize: number;
  total: number;
  draftCount: number;
  sentCount: number;
  acceptedCount: number;
  totalCount: number;
  pipelineValue: number;
  pipelineCurrency: string;
}) {
  const notify = useToast();

  function copyLink(token: string) {
    const link = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(link).then(() => notify("Quote link copied"));
  }

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Pending Quotes"
        text="Everything up to customer payment — once marked as paid on Customer Payments a quote moves to Confirmed Booking; rejected or expired quotes move to Lost Booking."
        action={
          canCreateQuote ? (
            <Link
              href="/quotes/new"
              className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
            >
              <FileText size={17} />
              Add New Quote
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Draft" value={String(draftCount)} icon={FileText} />
        <Kpi title="Awaiting response" value={String(sentCount)} delta={money(pipelineValue, pipelineCurrency) + " pipeline"} icon={Send} />
        <Kpi title="Accepted — awaiting payment" value={String(acceptedCount)} icon={CheckCircle2} />
        <Kpi title="Total quotes (all time)" value={String(totalCount)} icon={Timer} />
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
                <span className={"rounded-full px-2.5 py-1 text-xs font-bold capitalize " + STATUS_STYLE[q.status]}>{q.status}</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</div>
              <div className="mt-1 text-sm text-slate-600">{journeyOf(q)}</div>
              <div className="mt-2 font-black">{money(q.quote_versions?.selling_price, q.currency)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/quotes/${q.id}`}
                  className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                >
                  View
                </Link>
                {(q.status === "sent" || q.status === "viewed") && (
                  <button onClick={() => copyLink(q.public_token)} className="rounded-lg border px-3 py-2 text-xs font-bold">
                    Copy Link
                  </button>
                )}
              </div>
            </div>
          ))}
          {quotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No quotes yet — build one from an enquiry.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-3 py-4">Quote</th>
                <th className="px-3 py-4">Customer</th>
                <th className="px-3 py-4">Journey</th>
                <th className="px-3 py-4">Value</th>
                <th className="px-3 py-4">Status</th>
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
                  <td className="whitespace-nowrap px-3 py-4 font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{journeyOf(q)}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-black">{money(q.quote_versions?.selling_price, q.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <span className={"rounded-full px-2.5 py-1 text-xs font-bold capitalize " + STATUS_STYLE[q.status]}>
                      {q.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                      >
                        View
                      </Link>
                      {(q.status === "sent" || q.status === "viewed") && (
                        <button
                          onClick={() => copyLink(q.public_token)}
                          className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold"
                        >
                          Copy Link
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No quotes yet — build one from an enquiry.
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
