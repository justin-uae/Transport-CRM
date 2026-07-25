"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, UserCheck, UserPlus, FileText, TrendingUp, Plus } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { claimLeadAction } from "@/app/(staff)/leads/actions";
import type { LeadSource, LeadStatus } from "@/lib/supabase/database.types";

export interface LeadRow {
  id: string;
  source: LeadSource;
  status: LeadStatus;
  priority: "high" | "normal";
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  passenger_count: number | null;
  assigned_user_id: string | null;
  created_at: string;
  customers: { company_name: string | null; contact_name: string } | null;
  profiles: { full_name: string } | null;
  territories: { label: string } | null;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  assigned: "Assigned",
  open_pool: "Open pool",
  contacted: "Contacted",
  converted: "Converted",
  closed: "Closed",
  spam: "Spam",
  duplicate: "Duplicate",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function LeadsPage({
  leads,
  currentUserId,
  myOpenEnquiries,
  quotesAwaitingResponse,
  canAddEnquiry,
}: {
  leads: LeadRow[];
  currentUserId: string;
  myOpenEnquiries: number;
  quotesAwaitingResponse: number;
  canAddEnquiry: boolean;
}) {
  const notify = useToast();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"mine" | "pool" | "all">("mine");
  const [pending, startTransition] = useTransition();

  const mine = leads.filter((l) => l.assigned_user_id === currentUserId && l.status !== "closed");
  const pool = leads.filter((l) => l.status === "open_pool");
  const visible = tab === "mine" ? mine : tab === "pool" ? pool : leads;

  const filtered = useMemo(
    () => visible.filter((l) => JSON.stringify(l).toLowerCase().includes(search.toLowerCase())),
    [visible, search],
  );

  function claim(id: string) {
    startTransition(async () => {
      const result = await claimLeadAction(id);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Lead claimed and moved to your dashboard");
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title="Leads & geographic routing"
        text="Website, email, WhatsApp, telephone and live-chat leads in one workspace."
        action={
          canAddEnquiry ? (
            <Link
              href="/leads/new"
              className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
            >
              <Plus size={17} />
              Add Enquiry
            </Link>
          ) : undefined
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="My new leads" value={String(mine.length)} icon={UserCheck} />
        <Kpi title="Open pool" value={String(pool.length)} delta="Claimable now" icon={UserPlus} />
        <Kpi title="My open enquiries" value={String(myOpenEnquiries)} icon={TrendingUp} />
        <Kpi title="Quotes awaiting response" value={String(quotesAwaitingResponse)} icon={FileText} warn={quotesAwaitingResponse > 0} />
      </div>
      <Panel>
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <div className="flex gap-2">
            {(["mine", "pool", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "rounded-xl px-3 py-2 text-sm font-bold " +
                  (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
                }
              >
                {t === "mine" ? "My Leads" : t === "pool" ? "Open Pool" : "All"}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-4">Customer</th>
                <th>Journey</th>
                <th>Source</th>
                <th>Status</th>
                <th>Age</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t hover:bg-orange-50/30">
                  <td className="py-4 font-bold">
                    {l.customers?.company_name || l.customers?.contact_name || "Unassigned enquiry"}
                    {l.priority === "high" && (
                      <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">HIGH</span>
                    )}
                  </td>
                  <td>
                    <b>{l.pickup_text ?? "—"} → {l.destination_text ?? "—"}</b>
                    <div className="text-xs text-slate-400">{l.territories?.label ?? l.travel_date ?? ""}</div>
                  </td>
                  <td>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize">{l.source}</span>
                  </td>
                  <td>{STATUS_LABEL[l.status]}</td>
                  <td>{timeAgo(l.created_at)}</td>
                  <td>{l.profiles?.full_name || <span className="font-bold text-primary-600">Open pool</span>}</td>
                  <td>
                    {l.status === "open_pool" ? (
                      <button
                        disabled={pending}
                        onClick={() => claim(l.id)}
                        className="rounded-xl bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                      >
                        Take lead
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No leads here yet.
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
