"use client";

import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
} from "recharts";
import {
  CircleDollarSign,
  TrendingUp,
  Users,
  Bus,
  Download,
  Sparkles,
  Globe2,
  MapPin,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { revenueData, channelData, CHANNEL_COLORS, teamPerformance, seedLeads } from "@/components/demo/demoData";

export function ControlCentre({ firstName }: { firstName: string }) {
  const notify = useToast();
  const openLeads = seedLeads.filter((l) => !l.assigned);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="text-sm font-bold uppercase tracking-[.18em] text-primary-500">
            Global Transport Control Centre
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Good morning, {firstName}
          </h1>
          <p className="mt-2 text-slate-500">
            Live operations, finance and sales intelligence across every brand.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => notify("Executive report exported")}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"
          >
            <Download size={17} />
            Export
          </button>
          <Link
            href="/ai-optimisation"
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Sparkles size={17} />
            Ask AI
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Revenue today" value="AED 154,800" delta="+12.4%" icon={CircleDollarSign} />
        <Kpi title="Gross profit" value="AED 42,500" delta="+8.1%" icon={TrendingUp} />
        <Kpi title="New leads" value="47" delta="9 waiting" icon={Users} />
        <Kpi title="Jobs operating" value="28" delta="3 need attention" icon={Bus} warn />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_.85fr]">
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="font-black">Live global operations</h2>
              <p className="text-sm text-slate-500">Active bookings, leads and supplier activity</p>
            </div>
            <button className="rounded-xl border px-3 py-2 text-sm font-bold">
              <Globe2 className="mr-2 inline" size={16} />
              Live map
            </button>
          </div>
          <div className="relative h-[360px] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background:
                  "radial-gradient(circle at 30% 45%, #fb923c 0 2px, transparent 3px), radial-gradient(circle at 55% 38%, #fb923c 0 2px, transparent 3px), radial-gradient(circle at 72% 57%, #fb923c 0 2px, transparent 3px)",
              }}
            />
            <MapPulse label="London" value="12 jobs" style={{ left: "18%", top: "34%" }} />
            <MapPulse label="Dubai" value="8 jobs" style={{ left: "47%", top: "29%" }} />
            <MapPulse label="Singapore" value="5 jobs" style={{ left: "68%", top: "53%" }} />
            <div className="absolute bottom-5 left-5 flex gap-4 rounded-2xl bg-white/10 p-3 text-xs text-white backdrop-blur">
              <span>
                <i className="mr-2 inline-block h-2 w-2 rounded-full bg-orange-400" />
                Active jobs 28
              </span>
              <span>
                <i className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                New leads 47
              </span>
            </div>
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black">AI priority feed</h2>
              <p className="text-sm text-slate-500">High-impact actions</p>
            </div>
            <Sparkles className="text-primary-500" />
          </div>
          <div className="mt-5 space-y-3">
            <Alert type="danger" title="High-value lead waiting" text="UAE corporate enquiry worth AED 24,500 has waited 11 minutes." />
            <Alert type="warning" title="Margin risk detected" text="Three London bookings are below the 22% target margin." />
            <Alert type="success" title="Revenue opportunity" text="Raise Paris airport transfer pricing by 4% based on strong conversion." />
            <Alert type="info" title="Supplier compliance" text="Two insurance documents expire within seven days." />
          </div>
          <Link
            href="/ai-optimisation"
            className="mt-5 block w-full rounded-xl bg-primary-50 py-3 text-center text-sm font-black text-primary-700"
          >
            Open Optimisation Centre
          </Link>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionTitle title="Revenue & profit trend" sub="Last 7 days" />
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="url(#rev)" strokeWidth={3} />
                <Line type="monotone" dataKey="profit" stroke="#172033" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Lead channels" sub="Conversion mix" />
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={channelData} innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value">
                  {channelData.map((_, i) => (
                    <Cell key={i} fill={CHANNEL_COLORS[i]!} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {channelData.map((x, i) => (
              <div key={x.name} className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: CHANNEL_COLORS[i]! }} />
                {x.name} <b className="ml-auto">{x.value}%</b>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle title="Team performance" sub="Live sales activity" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-3">User</th>
                  <th>Leads</th>
                  <th>Conversion</th>
                  <th>Revenue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamPerformance.map((u) => (
                  <tr key={u.name} className="border-t">
                    <td className="whitespace-nowrap py-3">
                      <b>{u.name}</b>
                      <div className="text-xs text-slate-400">{u.territory}</div>
                    </td>
                    <td className="whitespace-nowrap">{u.leads}</td>
                    <td className="whitespace-nowrap">{u.conversion}</td>
                    <td className="whitespace-nowrap font-bold">{u.revenue}</td>
                    <td className="whitespace-nowrap">
                      <span
                        className={
                          "rounded-full px-2 py-1 text-xs font-bold " +
                          (u.status === "Working" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Open lead pool" sub={`${openLeads.length} available leads`} />
          <div className="mt-4 space-y-3">
            {openLeads.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl border p-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-600">
                  <MapPin size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <b className="text-sm">{l.route}</b>
                  <div className="text-xs text-slate-500">
                    {l.source} • {l.age} • {l.value}
                  </div>
                </div>
                <Link href="/leads" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                  View
                </Link>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MapPulse({
  label,
  value,
  style,
}: {
  label: string;
  value: string;
  style: React.CSSProperties;
}) {
  return (
    <div className="absolute" style={style}>
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-orange-400/30" />
        <div className="relative rounded-2xl bg-white px-3 py-2 shadow-xl">
          <div className="text-xs font-black text-slate-900">{label}</div>
          <div className="text-[10px] text-slate-500">{value}</div>
        </div>
      </div>
    </div>
  );
}
