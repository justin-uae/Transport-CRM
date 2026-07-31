"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { markQuotePaidAction } from "@/app/(staff)/quotes/actions";
import type { QuoteStatus } from "@/lib/supabase/database.types";

export interface AcceptedQuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  decided_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  customers: { company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[] } | null;
  quote_versions: { selling_price: number } | null;
}

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function CustomerPaymentsPage({ quotes }: { quotes: AcceptedQuoteRow[] }) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"awaiting" | "paid">("awaiting");
  const [target, setTarget] = useState<AcceptedQuoteRow | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const awaiting = useMemo(() => quotes.filter((q) => q.status === "accepted"), [quotes]);
  const paid = useMemo(() => quotes.filter((q) => q.status === "paid"), [quotes]);
  const visible = tab === "awaiting" ? awaiting : paid;

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const result = await markQuotePaidAction(target.id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Marked as paid — invoice generated and job sent to Dispatch");
      setTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Accounting"
        title="Customer Payments"
        text="Quotes the customer has accepted — mark paid once their bank transfer arrives."
      />
      <div className="mb-4 flex gap-2">
        {(["awaiting", "paid"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-xl px-3 py-2 text-sm font-bold " +
              (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
            }
          >
            {t === "awaiting" ? `Awaiting Payment (${awaiting.length})` : `Paid (${paid.length})`}
          </button>
        ))}
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-3 py-4">Quote</th>
                <th className="px-3 py-4">Customer</th>
                <th className="px-3 py-4">Journey</th>
                <th className="px-3 py-4">Value</th>
                <th className="px-3 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((q) => {
                const leg = q.enquiries?.enquiry_legs?.[0];
                return (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-4 font-black text-primary-600">
                      {q.quote_number}
                      {q.invoice_number && <div className="text-xs font-normal text-slate-400">Inv {q.invoice_number}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                      {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 font-black">{money(q.quote_versions?.selling_price, q.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/quotes/${q.id}`}
                          className="shrink-0 whitespace-nowrap rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                        >
                          View
                        </Link>
                        {q.status === "accepted" && (
                          <button
                            disabled={pending}
                            onClick={() => {
                              setModalError(null);
                              setTarget(q);
                            }}
                            className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                          >
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    {tab === "awaiting" ? "No quotes awaiting payment." : "No paid quotes yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {target && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setTarget(null)}
          title="Mark this quote as paid?"
          description="This generates an invoice number and sends the job to Dispatch — only do this once the customer's bank transfer has arrived."
          pending={pending}
          error={modalError}
          details={[
            { label: "Quote", value: target.quote_number },
            { label: "Customer", value: target.customers?.company_name || target.customers?.contact_name || "—" },
            { label: "Value", value: money(target.quote_versions?.selling_price, target.currency) },
          ]}
          confirmLabel="Mark as paid"
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
