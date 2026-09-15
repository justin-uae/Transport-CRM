"use client";

import { Send, CheckCircle2, Timer, FileText } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { useToast } from "@/components/ui/Toast";
import { PageGuide } from "@/components/ui/PageGuide";
import { QuotesDiagram } from "@/components/ui/guide-diagrams/QuotesDiagram";
import type { QuoteStatus } from "@/lib/supabase/database.types";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_STYLE } from "@/lib/quoteStatus";

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


function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeyOf(q: QuoteRow) {
  return q.enquiries?.enquiry_legs?.[0] ?? null;
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
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Pending Quotes"
              subtitle="Every priced enquiry, from draft through to customer payment."
              screenshot={<QuotesDiagram />}
              sections={[
                {
                  heading: "What a quote is",
                  body: [
                    "A quote is a priced version of an enquiry — created from a lead once you know the route, vehicle and price. It has its own quote number and a shareable link the customer can view and accept online.",
                  ],
                },
                {
                  heading: "The lifecycle",
                  bullets: true,
                  body: [
                    "Draft — being built, not yet sent to the customer.",
                    "Sent — the customer has been emailed/given the quote link.",
                    "Viewed — the customer has opened the link.",
                    "Accepted — the customer approved it and it's awaiting payment.",
                    "Once payment is confirmed on Customer Payments, it moves to Confirmed Booking.",
                    "If the customer rejects it or it expires unactioned, it moves to Lost Booking instead.",
                  ],
                },
                {
                  heading: "Working a quote",
                  bullets: true,
                  body: [
                    "Add New Quote starts a fresh quote (normally reached from a lead via Create Quote).",
                    "View opens the full quote detail — pricing, versions and customer activity.",
                    "Copy Link grabs the customer-facing link for a Sent/Viewed quote so you can share it directly (e.g. over WhatsApp or email).",
                  ],
                },
                {
                  heading: "Editing after the fact",
                  bullets: true,
                  body: [
                    "Edit Booking, on the quote detail page, works at any stage — draft through fully paid — right up until the job is marked completed by the supplier.",
                    "Change the pickup, destination, date, time, passengers or luggage; optionally charge or credit the customer, and/or adjust what a supplier is owed — a reason is always required.",
                    "A positive customer amount adds to the balance due (the customer gets an emailed link to pay it); a negative amount lowers the price and auto-queues a refund if that leaves them overpaid.",
                    "Every edit is logged to that quote's Edit history panel with who made it, why, and a before/after diff, and (when relevant) emails both the customer and the supplier — the same button and history also appear on the matching Dispatch job page.",
                  ],
                },
                {
                  heading: "The KPI cards",
                  bullets: true,
                  body: [
                    "Draft — quotes not yet sent.",
                    "Awaiting response — sent/viewed quotes, with the total pipeline value still open.",
                    "Accepted — awaiting payment — won quotes waiting on the customer to pay.",
                    "Total quotes (all time) — every quote ever created, regardless of status.",
                  ],
                },
              ]}
            />
            {canCreateQuote ? (
              <Link
                href="/quotes/new"
                className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
              >
                <FileText size={17} />
                Add New Quote
              </Link>
            ) : undefined}
          </div>
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
                <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + QUOTE_STATUS_STYLE[q.status]}>{QUOTE_STATUS_LABEL[q.status]}</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</div>
              <div className="mt-1 text-sm text-slate-600">
                <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} maxWidth="100%" />
              </div>
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
                  <td className="px-3 py-4 text-slate-600">
                    <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-black">{money(q.quote_versions?.selling_price, q.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + QUOTE_STATUS_STYLE[q.status]}>
                      {QUOTE_STATUS_LABEL[q.status]}
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
