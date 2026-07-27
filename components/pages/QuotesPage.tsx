"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Send, CheckCircle2, Timer, FileText } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { markQuotePaidAction } from "@/app/(staff)/quotes/actions";
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

export function QuotesPage({ quotes }: { quotes: QuoteRow[] }) {
  const notify = useToast();
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  function markPaid(quoteId: string) {
    startTransition(async () => {
      const result = await markQuotePaidAction(quoteId);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Quote marked as paid — invoice generated and job sent to Dispatch");
    });
  }

  function copyLink(token: string, label: string) {
    const link = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(link).then(() => notify(`${label} link copied`));
  }

  const filtered = useMemo(
    () => quotes.filter((q) => JSON.stringify(q).toLowerCase().includes(search.toLowerCase())),
    [quotes, search],
  );

  const sentCount = quotes.filter((q) => q.status === "sent" || q.status === "viewed").length;
  const acceptedCount = quotes.filter((q) => q.status === "accepted" || q.status === "converted").length;
  const draftCount = quotes.filter((q) => q.status === "draft").length;
  const pipelineValue = quotes
    .filter((q) => q.status === "sent" || q.status === "viewed")
    .reduce((sum, q) => sum + (q.quote_versions?.selling_price ?? 0), 0);

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Quotes"
        text="Create, price, send and monitor every customer quotation."
        action={
          <Link
            href="/quotes/new"
            className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
          >
            <FileText size={17} />
            Add New Quote
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Draft" value={String(draftCount)} icon={FileText} />
        <Kpi title="Awaiting response" value={String(sentCount)} delta={money(pipelineValue, quotes[0]?.currency ?? "EUR") + " pipeline"} icon={Send} />
        <Kpi title="Accepted" value={String(acceptedCount)} icon={CheckCircle2} />
        <Kpi title="Total quotes" value={String(quotes.length)} icon={Timer} />
      </div>
      <Panel className="mt-6">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotes"
              className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
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
              {filtered.map((q) => {
                const leg = q.enquiries?.enquiry_legs?.[0];
                return (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="px-3 py-4 font-black text-primary-600">
                      {q.quote_number}
                      {q.invoice_number && <div className="text-xs font-normal text-slate-400">Inv {q.invoice_number}</div>}
                    </td>
                    <td className="px-3 py-4 font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</td>
                    <td className="px-3 py-4 text-slate-600">
                      {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                    </td>
                    <td className="px-3 py-4 font-black">{money(q.quote_versions?.selling_price, q.currency)}</td>
                    <td className="px-3 py-4">
                      <span className={"rounded-full px-2.5 py-1 text-xs font-bold capitalize " + STATUS_STYLE[q.status]}>
                        {q.status}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right">
                      {q.status === "accepted" && (
                        <button
                          disabled={pending}
                          onClick={() => markPaid(q.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          Mark as Paid
                        </button>
                      )}
                      {q.status === "paid" && (
                        <button
                          onClick={() => copyLink(q.public_token, "Invoice")}
                          className="rounded-lg border px-3 py-2 text-xs font-bold"
                        >
                          Resend Invoice
                        </button>
                      )}
                      {(q.status === "sent" || q.status === "viewed") && (
                        <button
                          onClick={() => copyLink(q.public_token, "Quote")}
                          className="rounded-lg border px-3 py-2 text-xs font-bold"
                        >
                          Copy Link
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No quotes yet — build one from an enquiry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
