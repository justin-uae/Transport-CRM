"use client";

import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Landmark, ReceiptText, TrendingUp, Truck, FileText } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { bankTransferQueue, receivablesAgeing } from "@/components/demo/demoData";

export function AccountingPage() {
  const notify = useToast();

  return (
    <div>
      <PageHead
        eyebrow="Finance Suite"
        title="Accounting & payment control"
        text="Invoices, bank transfers, supplier costs, reconciliation and group reporting."
        action={
          <button
            onClick={() => notify("New invoice opened")}
            className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
          >
            <FileText size={17} />
            New Invoice
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Collected revenue" value="AED 1.84m" delta="This month" icon={Landmark} />
        <Kpi title="Outstanding" value="AED 286k" delta="17 invoices" icon={ReceiptText} warn />
        <Kpi title="Gross profit" value="AED 492k" delta="26.7% margin" icon={TrendingUp} />
        <Kpi title="Supplier payable" value="AED 418k" delta="Next 14 days" icon={Truck} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Panel>
          <SectionTitle title="Bank transfer verification" sub="Manager approval queue" />
          <div className="mt-4 space-y-3">
            {bankTransferQueue.map((x) => (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" key={x[0]}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Landmark size={19} />
                </div>
                <div className="flex-1">
                  <b>{x[1]}</b>
                  <div className="text-xs text-slate-500">{x[0]} • Bank transfer pending</div>
                </div>
                <b>{x[2]}</b>
                <button
                  onClick={() => notify(`${x[0]} verified and user dashboard updated`)}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Verify paid
                </button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Accounts receivable" sub="Ageing summary" />
          <div className="mt-5 h-64">
            <ResponsiveContainer>
              <BarChart data={receivablesAgeing}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="n" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="v" fill="#f97316" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
