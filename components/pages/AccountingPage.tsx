"use client";

import Link from "next/link";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Landmark, ReceiptText, TrendingUp, Truck } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { AccountingSummary } from "@/lib/accountingSummary";

function compactGbp(amount: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    // Without an explicit minimum, "compact" notation's trailing-zero
    // trimming is inconsistent between Node's ICU (SSR) and the browser's
    // (hydration) for the same number — e.g. "£25.7" vs "£25.70" — which
    // React then flags as a hydration mismatch. Pinning both bounds makes
    // the output deterministic across environments.
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function AccountingPage({ summary }: { summary: AccountingSummary }) {
  return (
    <div>
      <PageHead
        eyebrow="Finance Suite"
        title="Accounting & payment control"
        text="Invoices, bank transfers, supplier costs, reconciliation and group reporting."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Collected revenue"
          value={compactGbp(summary.collectedRevenueGbp)}
          delta="This month"
          icon={Landmark}
        />
        <Kpi
          title="Outstanding"
          value={compactGbp(summary.outstandingGbp)}
          delta={`${summary.outstandingCount} quote${summary.outstandingCount === 1 ? "" : "s"}`}
          icon={ReceiptText}
          warn
        />
        <Kpi
          title="Gross profit"
          value={compactGbp(summary.grossProfitGbp)}
          delta={
            summary.grossProfitMarginPct === null
              ? "No paid quotes this month"
              : `${summary.grossProfitMarginPct.toFixed(1)}% margin`
          }
          icon={TrendingUp}
        />
        <Kpi
          title="Supplier payable"
          value={compactGbp(summary.supplierPayableGbp)}
          delta={`${summary.supplierPayableCount} invoice${summary.supplierPayableCount === 1 ? "" : "s"}`}
          icon={Truck}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Panel>
          <SectionTitle title="Bank transfer verification" sub="Manager approval queue" />
          <div className="mt-4 space-y-3">
            {summary.bankTransferQueue.map((x) => (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" key={x.quoteId}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Landmark size={19} />
                </div>
                <div className="flex-1">
                  <b>{x.customerName}</b>
                  <div className="text-xs text-slate-500">{x.quoteNumber} • Awaiting payment</div>
                </div>
                <b>{money(x.balance, x.currency)}</b>
                <Link
                  href="/accounting/customer-payments"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Review &amp; record
                </Link>
              </div>
            ))}
            {summary.bankTransferQueue.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No quotes awaiting payment.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Accounts receivable" sub="Ageing summary" />
          <div className="mt-5 h-64">
            <ResponsiveContainer>
              <BarChart data={summary.receivablesAgeing}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="n" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => compactGbp(value)} />
                <Bar dataKey="v" fill="#f97316" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
