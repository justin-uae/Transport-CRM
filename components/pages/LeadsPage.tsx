"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { UserCheck, UserPlus, FileText, TrendingUp, Plus } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { claimLeadAction, createEnquiryFromLeadAction, releaseLeadAction } from "@/app/(staff)/leads/actions";
import { formatDate } from "@/lib/formatDate";
import type { LeadSource, LeadStatus } from "@/lib/supabase/database.types";

export type LeadTab = "mine" | "pool" | "all";

export interface LeadRow {
  id: string;
  source: LeadSource;
  status: LeadStatus;
  priority: "high" | "normal";
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  passenger_count: number | null;
  vehicle_requested: string | null;
  notes: string | null;
  assigned_user_id: string | null;
  created_at: string;
  customers: { company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
  profiles: { full_name: string } | null;
  brands: { name: string } | null;
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
  canClaim,
  canRelease,
  canViewAll,
  tab,
  mineCount,
  poolCount,
  page,
  pageSize,
  total,
}: {
  leads: LeadRow[];
  currentUserId: string;
  myOpenEnquiries: number;
  quotesAwaitingResponse: number;
  canAddEnquiry: boolean;
  canClaim: boolean;
  canRelease: boolean;
  canViewAll: boolean;
  tab: LeadTab;
  mineCount: number;
  poolCount: number;
  page: number;
  pageSize: number;
  total: number;
}) {
  const notify = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  function tabHref(t: LeadTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  }

  function openDetail(lead: LeadRow) {
    setModalError(null);
    setDetailLead(lead);
  }

  function closeDetail() {
    if (pending) return;
    setDetailLead(null);
    setModalError(null);
  }

  function claim(id: string) {
    startTransition(async () => {
      const result = await claimLeadAction(id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead accepted and moved to your dashboard");
      setDetailLead(null);
    });
  }

  function createQuote(id: string) {
    startTransition(async () => {
      const result = await createEnquiryFromLeadAction(id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
      }
      // On success this redirects into /quotes/new — nothing else to do here.
    });
  }

  function release(id: string) {
    startTransition(async () => {
      const result = await releaseLeadAction(id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead released back to the open pool");
      setDetailLead(null);
    });
  }

  const isOwnActiveLead = (l: LeadRow) =>
    l.assigned_user_id === currentUserId && l.status !== "converted" && l.status !== "closed";

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
        <Kpi title="My new leads" value={String(mineCount)} icon={UserCheck} />
        <Kpi title="Open pool" value={String(poolCount)} delta="Claimable now" icon={UserPlus} />
        <Kpi title="My open enquiries" value={String(myOpenEnquiries)} icon={TrendingUp} />
        <Kpi title="Quotes awaiting response" value={String(quotesAwaitingResponse)} icon={FileText} warn={quotesAwaitingResponse > 0} />
      </div>
      <Panel>
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <div className="flex gap-2">
            {(["mine", "pool", "all"] as const)
              .filter((t) => t !== "all" || canViewAll)
              .map((t) => (
                <Link
                  key={t}
                  href={tabHref(t)}
                  className={
                    "rounded-xl px-3 py-2 text-sm font-bold " +
                    (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
                  }
                >
                  {t === "mine" ? "My Leads" : t === "pool" ? "Open Pool" : "All"}
                </Link>
              ))}
          </div>
          <SearchInput placeholder="Search leads…" />
        </div>
        <div className="space-y-3 py-4 sm:hidden">
          {leads.map((l) => (
            <div key={l.id} onClick={() => openDetail(l)} className="cursor-pointer rounded-2xl border p-4 hover:bg-orange-50/30">
              <div className="flex items-center justify-between gap-2">
                <b>
                  {l.customers?.company_name || l.customers?.contact_name || "Unassigned enquiry"}
                  {l.priority === "high" && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">HIGH</span>
                  )}
                </b>
                <span className="shrink-0 text-right">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize">{l.source}</span>
                  {l.brands?.name && <div className="mt-1 text-[10px] text-slate-400">{l.brands.name}</div>}
                </span>
              </div>
              <div className="mt-1 text-sm">
                <JourneyCell pickup={l.pickup_text} destination={l.destination_text} maxWidth="100%" />
                <div className="text-xs text-slate-400">{l.travel_date ? formatDate(l.travel_date) : ""}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {STATUS_LABEL[l.status]} · {timeAgo(l.created_at)}
                </span>
                <span>{l.profiles?.full_name || <span className="font-bold text-primary-600">Open pool</span>}</span>
              </div>
              {((l.status === "open_pool" && canClaim) || isOwnActiveLead(l)) && (
                <button
                  disabled={pending}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(l);
                  }}
                  className={
                    "mt-3 w-full rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60 " +
                    (l.status === "open_pool" ? "bg-primary-500 text-white" : "border border-primary-300 text-primary-700")
                  }
                >
                  {l.status === "open_pool" ? "Accept" : "View"}
                </button>
              )}
            </div>
          ))}
          {leads.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No leads here yet.</p>}
        </div>
        <div className="hidden overflow-x-auto sm:block">
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
              {leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => openDetail(l)}
                  className="cursor-pointer border-t hover:bg-orange-50/30"
                >
                  <td className="whitespace-nowrap py-4 font-bold">
                    {l.customers?.company_name || l.customers?.contact_name || "Unassigned enquiry"}
                    {l.priority === "high" && (
                      <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">HIGH</span>
                    )}
                  </td>
                  <td>
                    <JourneyCell pickup={l.pickup_text} destination={l.destination_text} />
                    <div className="text-xs text-slate-400">{l.travel_date ? formatDate(l.travel_date) : ""}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize">{l.source}</span>
                    {l.brands?.name && <div className="mt-1 text-[10px] text-slate-400">{l.brands.name}</div>}
                  </td>
                  <td className="whitespace-nowrap">{STATUS_LABEL[l.status]}</td>
                  <td className="whitespace-nowrap">{timeAgo(l.created_at)}</td>
                  <td className="whitespace-nowrap">{l.profiles?.full_name || <span className="font-bold text-primary-600">Open pool</span>}</td>
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {l.status === "open_pool" && canClaim ? (
                      <button
                        disabled={pending}
                        onClick={() => openDetail(l)}
                        className="whitespace-nowrap rounded-xl bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                      >
                        Accept
                      </button>
                    ) : isOwnActiveLead(l) ? (
                      <button
                        disabled={pending}
                        onClick={() => openDetail(l)}
                        className="whitespace-nowrap rounded-xl border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700 disabled:opacity-60"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No leads here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>

      {detailLead && (
        <ConfirmDetailModal
          open
          onClose={closeDetail}
          title={detailLead.customers?.company_name || detailLead.customers?.contact_name || "Lead details"}
          description={`${STATUS_LABEL[detailLead.status]} · captured ${timeAgo(detailLead.created_at)} ago via ${detailLead.source}`}
          pending={pending}
          error={modalError}
          cancelLabel={
            detailLead.status === "open_pool" || isOwnActiveLead(detailLead) ? "Cancel" : "Close"
          }
          details={[
            { label: "Source", value: <span className="capitalize">{detailLead.source}</span> },
            { label: "Brand / website", value: detailLead.brands?.name ?? "—" },
            { label: "Pickup", value: detailLead.pickup_text ?? "—" },
            { label: "Destination", value: detailLead.destination_text ?? "—" },
            { label: "Travel date", value: detailLead.travel_date ? formatDate(detailLead.travel_date) : "—" },
            { label: "Passengers", value: detailLead.passenger_count ?? "—" },
            { label: "Vehicle requested", value: detailLead.vehicle_requested ?? "—" },
            { label: "Priority", value: detailLead.priority === "high" ? "High" : "Normal" },
            {
              label: "Owner",
              value: detailLead.profiles?.full_name || (
                <span className="font-bold text-primary-600">Open pool</span>
              ),
            },
            { label: "Customer phone", value: detailLead.customers?.phone ?? "—" },
            { label: "Customer email", value: detailLead.customers?.email ?? "—" },
            { label: "Notes", value: detailLead.notes ?? "—" },
          ]}
          confirmLabel={
            detailLead.status === "open_pool" && canClaim
              ? "Claim this lead"
              : isOwnActiveLead(detailLead) && canAddEnquiry
                ? "Create Quote"
                : undefined
          }
          onConfirm={
            detailLead.status === "open_pool" && canClaim
              ? () => claim(detailLead.id)
              : isOwnActiveLead(detailLead) && canAddEnquiry
                ? () => createQuote(detailLead.id)
                : undefined
          }
        >
          {isOwnActiveLead(detailLead) && canRelease && (
            <button
              type="button"
              disabled={pending}
              onClick={() => release(detailLead.id)}
              className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
            >
              Release to open pool
            </button>
          )}
        </ConfirmDetailModal>
      )}
    </div>
  );
}
