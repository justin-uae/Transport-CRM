"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Send, CheckCircle2, Timer, FileText } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
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

type QuoteAction = { type: "markPaid" | "resend"; quote: QuoteRow };

export function QuotesPage({
  quotes,
  canMarkPaid,
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
  canMarkPaid: boolean;
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
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<QuoteAction | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  function closeAction() {
    if (pending) return;
    setAction(null);
    setModalError(null);
  }

  function markPaid(quoteId: string) {
    startTransition(async () => {
      const result = await markQuotePaidAction(quoteId);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Quote marked as paid — invoice generated and job sent to Dispatch");
      setAction(null);
    });
  }

  function copyLink(token: string, label: string) {
    const link = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(link).then(() => notify(`${label} link copied`));
  }

  function confirmAction() {
    if (!action) return;
    if (action.type === "markPaid") {
      markPaid(action.quote.id);
    } else {
      copyLink(action.quote.public_token, "Invoice");
      setAction(null);
    }
  }

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
        <Kpi title="Awaiting response" value={String(sentCount)} delta={money(pipelineValue, pipelineCurrency) + " pipeline"} icon={Send} />
        <Kpi title="Accepted" value={String(acceptedCount)} icon={CheckCircle2} />
        <Kpi title="Total quotes" value={String(totalCount)} icon={Timer} />
      </div>
      <Panel className="mt-6">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <SearchInput placeholder="Search quotes (number or invoice)" />
        </div>
        <div className="overflow-x-auto">
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
              {quotes.map((q) => {
                const leg = q.enquiries?.enquiry_legs?.[0];
                return (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-4 font-black text-primary-600">
                      <Link href={`/quotes/${q.id}`} className="hover:underline">
                        {q.quote_number}
                      </Link>
                      {q.invoice_number && <div className="text-xs font-normal text-slate-400">Inv {q.invoice_number}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                      {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                    </td>
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
                        {q.status === "accepted" && canMarkPaid && (
                          <button
                            disabled={pending}
                            onClick={() => {
                              setModalError(null);
                              setAction({ type: "markPaid", quote: q });
                            }}
                            className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                          >
                            Mark as Paid
                          </button>
                        )}
                        {q.status === "paid" && (
                          <button
                            onClick={() => {
                              setModalError(null);
                              setAction({ type: "resend", quote: q });
                            }}
                            className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold"
                          >
                            Resend Invoice
                          </button>
                        )}
                        {(q.status === "sent" || q.status === "viewed") && (
                          <button
                            onClick={() => copyLink(q.public_token, "Quote")}
                            className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold"
                          >
                            Copy Link
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {action && (
        <ConfirmDetailModal
          open
          onClose={closeAction}
          title={action.type === "markPaid" ? "Mark this quote as paid?" : "Resend the invoice link?"}
          description={
            action.type === "markPaid"
              ? "This generates an invoice number and sends the job to Dispatch — only do this once the customer's bank transfer has arrived."
              : "This copies the customer's invoice link to your clipboard so you can share it again."
          }
          pending={pending}
          error={modalError}
          details={[
            { label: "Quote", value: action.quote.quote_number },
            { label: "Customer", value: action.quote.customers?.company_name || action.quote.customers?.contact_name || "—" },
            { label: "Value", value: money(action.quote.quote_versions?.selling_price, action.quote.currency) },
            ...(action.type === "resend" ? [{ label: "Invoice", value: action.quote.invoice_number ?? "—" }] : []),
          ]}
          confirmLabel={action.type === "markPaid" ? "Mark as paid" : "Copy link"}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}
