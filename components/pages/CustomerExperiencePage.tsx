"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Gauge, Reply, ShieldCheck, Repeat, Star } from "lucide-react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import type { FeedbackCategory } from "@/lib/supabase/database.types";

export interface FeedbackRow {
  id: string;
  customerName: string;
  quoteNumber: string | null;
  score: number | null;
  category: FeedbackCategory | null;
  comment: string | null;
  requestedAt: string;
  submittedAt: string | null;
  followUpTaskId: string | null;
  followUpDone: boolean;
}

type Tab = "all" | FeedbackCategory;

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "promoter", label: "Promoter" },
  { key: "passive", label: "Passive" },
  { key: "detractor", label: "Detractor" },
];

const CATEGORY_BADGE: Record<FeedbackCategory, string> = {
  promoter: "bg-emerald-50 text-emerald-700",
  passive: "bg-amber-50 text-amber-700",
  detractor: "bg-red-50 text-red-700",
};

function pct(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export function CustomerExperiencePage({
  rows,
  nps,
  responseRate,
  complaintResolutionRate,
  repeatBookingRate,
}: {
  rows: FeedbackRow[];
  nps: number | null;
  responseRate: number | null;
  complaintResolutionRate: number | null;
  repeatBookingRate: number | null;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tab !== "all" && r.category !== tab) return false;
      if (q && !`${r.customerName} ${r.comment ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, tab, q]);

  return (
    <div>
      <PageHead
        eyebrow="Post-Trip"
        title="Customer Experience"
        text="One NPS question per completed job — automatically requested, automatically escalated when the score is low."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="NPS Score" value={nps === null ? "—" : String(nps)} icon={Gauge} />
        <Kpi title="Response Rate" value={pct(responseRate)} icon={Reply} />
        <Kpi title="Complaint Resolution" value={pct(complaintResolutionRate)} icon={ShieldCheck} />
        <Kpi title="Repeat Booking" value={pct(repeatBookingRate)} icon={Repeat} />
      </div>

      <Panel className="mt-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm font-bold",
                  tab === t.key ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by customer or comment…"
            className="w-full rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none md:w-72"
          />
        </div>

        <div className="space-y-3 sm:hidden">
          {filtered.map((row) => (
            <FeedbackCard key={row.id} row={row} />
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No feedback yet.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Customer</th>
                <th>Score</th>
                <th>Comment</th>
                <th>Requested</th>
                <th>Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="py-4">
                    <div className="font-bold">{row.customerName}</div>
                    {row.quoteNumber && <div className="text-xs text-slate-500">{row.quoteNumber}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.submittedAt && row.category ? (
                      <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold", CATEGORY_BADGE[row.category])}>
                        {row.score} · {row.category}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting response</span>
                    )}
                  </td>
                  <td className="max-w-xs truncate">{row.comment ?? "—"}</td>
                  <td className="whitespace-nowrap">{new Date(row.requestedAt).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap">
                    {row.followUpTaskId ? (
                      <Link href={`/tasks`} className="text-xs font-bold text-primary-600">
                        {row.followUpDone ? "Resolved" : "Task open"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No feedback yet.
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

function FeedbackCard({ row }: { row: FeedbackRow }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-bold">
            <Star size={14} className="text-slate-400" />
            {row.customerName}
          </div>
          {row.quoteNumber && <div className="text-xs text-slate-500">{row.quoteNumber}</div>}
        </div>
        {row.submittedAt && row.category ? (
          <span className={clsx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", CATEGORY_BADGE[row.category])}>
            {row.score} · {row.category}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-slate-400">Awaiting</span>
        )}
      </div>
      {row.comment && <p className="mt-2 text-sm text-slate-600">{row.comment}</p>}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{new Date(row.requestedAt).toLocaleDateString()}</span>
        {row.followUpTaskId && (
          <Link href="/tasks" className="font-bold text-primary-600">
            {row.followUpDone ? "Follow-up resolved" : "Follow-up task open"}
          </Link>
        )}
      </div>
    </div>
  );
}
