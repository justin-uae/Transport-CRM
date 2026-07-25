"use client";

import { useMemo, useState } from "react";
import { Search, Filter, UserCheck, UserPlus, Timer, TrendingUp } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { seedLeads, type DemoLead } from "@/components/demo/demoData";

export function LeadsPage() {
  const notify = useToast();
  const [leads, setLeads] = useState<DemoLead[]>(seedLeads);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => leads.filter((l) => JSON.stringify(l).toLowerCase().includes(search.toLowerCase())),
    [leads, search],
  );

  function claim(id: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, assigned: "You" } : l)));
    notify("Lead claimed and moved to your dashboard");
  }

  return (
    <div>
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title="Leads & geographic routing"
        text="Website, email, WhatsApp, telephone and live-chat leads in one workspace."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="My assigned" value="28" delta="6 new" icon={UserCheck} />
        <Kpi title="Open pool" value={String(leads.filter((l) => !l.assigned).length)} delta="Claimable now" icon={UserPlus} />
        <Kpi title="Avg response" value="6m 14s" delta="-18%" icon={Timer} />
        <Kpi title="Conversion" value="34.8%" delta="+3.2%" icon={TrendingUp} />
      </div>
      <Panel>
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 outline-none"
            />
          </div>
          <button className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold">
            <Filter size={16} />
            Filters
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-4">Lead</th>
                <th>Customer</th>
                <th>Journey</th>
                <th>Source</th>
                <th>Value</th>
                <th>Age</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t hover:bg-orange-50/30">
                  <td className="py-4 font-bold">{l.id}</td>
                  <td>{l.customer}</td>
                  <td>
                    <b>{l.route}</b>
                    <div className="text-xs text-slate-400">{l.country}</div>
                  </td>
                  <td>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{l.source}</span>
                  </td>
                  <td className="font-bold">{l.value}</td>
                  <td>{l.age}</td>
                  <td>
                    {l.assigned || <span className="font-bold text-primary-600">Open pool</span>}
                  </td>
                  <td>
                    {!l.assigned ? (
                      <button
                        onClick={() => claim(l.id)}
                        className="rounded-xl bg-primary-500 px-3 py-2 text-xs font-bold text-white"
                      >
                        Take lead
                      </button>
                    ) : (
                      <button className="rounded-xl border px-3 py-2 text-xs font-bold">Open</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
