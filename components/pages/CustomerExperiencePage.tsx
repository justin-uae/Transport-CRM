"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Gauge, Reply, ShieldCheck, Repeat, Star } from "lucide-react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
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

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  promoter: "Happy",
  passive: "Neutral",
  detractor: "Unhappy",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "promoter", label: CATEGORY_LABEL.promoter },
  { key: "passive", label: CATEGORY_LABEL.passive },
  { key: "detractor", label: CATEGORY_LABEL.detractor },
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
  const [selected, setSelected] = useState<FeedbackRow | null>(null);

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

        <div className="space-y-3">
          {filtered.map((row) => (
            <FeedbackCard key={row.id} row={row} onSelect={() => setSelected(row)} />
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No feedback yet.</p>}
        </div>
      </Panel>

      {selected && (
        <ConfirmDetailModal
          open
          onClose={() => setSelected(null)}
          title={selected.customerName}
          description={selected.quoteNumber ?? undefined}
          details={[
            {
              label: "Score",
              value:
                selected.submittedAt && selected.category ? (
                  <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold", CATEGORY_BADGE[selected.category])}>
                    {selected.score} · {CATEGORY_LABEL[selected.category]}
                  </span>
                ) : (
                  "Awaiting response"
                ),
            },
            { label: "Requested", value: new Date(selected.requestedAt).toLocaleString() },
            { label: "Submitted", value: selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : "—" },
            {
              label: "Follow-up",
              value: selected.followUpTaskId ? (
                <Link href="/tasks" className="font-bold text-primary-600">
                  {selected.followUpDone ? "Resolved" : "Task open"}
                </Link>
              ) : (
                "—"
              ),
            },
          ]}
        >
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">Comment</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{selected.comment ?? "No comment left."}</p>
          </div>
        </ConfirmDetailModal>
      )}
    </div>
  );
}

function FeedbackCard({ row, onSelect }: { row: FeedbackRow; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 hover:border-primary-300 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Star size={14} className="shrink-0 text-slate-400" />
          <span className="truncate">{row.customerName}</span>
          {row.quoteNumber && <span className="shrink-0 text-xs font-normal text-slate-400">· {row.quoteNumber}</span>}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {row.comment ?? <span className="italic text-slate-400">No comment left.</span>}
        </p>
      </div>

      <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
        {row.submittedAt && row.category ? (
          <span className={clsx("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", CATEGORY_BADGE[row.category])}>
            {row.score} · {CATEGORY_LABEL[row.category]}
          </span>
        ) : (
          <span className="whitespace-nowrap text-xs font-semibold text-slate-400">Awaiting response</span>
        )}
        <span className="whitespace-nowrap text-xs text-slate-400">{new Date(row.requestedAt).toLocaleDateString()}</span>
        {row.followUpTaskId && (
          <Link
            href="/tasks"
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap text-xs font-bold text-primary-600"
          >
            {row.followUpDone ? "Follow-up resolved" : "Follow-up task open"}
          </Link>
        )}
      </div>
    </div>
  );
}
