"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import { claimLeadAction, createEnquiryFromLeadAction, releaseLeadAction } from "@/app/(staff)/leads/actions";
import { formatDate, formatTimeOnly } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { LeadSource, LeadStatus } from "@/lib/supabase/database.types";

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

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function displayTime(time: string) {
  return TIME_RE.test(time) ? formatTimeOnly(time) : time;
}

function WhenRow({ label, date, time }: { label: string; date: string | null; time: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <b>
        {date ? formatDate(date) : "—"}
        {date && time && <span className="ml-2 font-normal text-slate-500">{displayTime(time)}</span>}
      </b>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <b>{value ?? "—"}</b>
    </div>
  );
}

export interface LeadDetail {
  id: string;
  source: LeadSource;
  status: LeadStatus;
  priority: "high" | "normal";
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  return_trip: boolean;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  is_complex_booking: boolean;
  vehicle_requested: string | null;
  notes: string | null;
  assigned_user_id: string | null;
  created_at: string;
  customer_id: string | null;
  customers: { id: string; company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
  profiles: { full_name: string } | null;
  brands: { name: string } | null;
}

export interface LeadDetailQuote {
  id: string;
  quote_number: string;
  status: string;
}

export function LeadDetailPage({
  lead,
  legs,
  enquiryId,
  quote,
  currentUserId,
  canAddEnquiry,
  canClaim,
  canRelease,
}: {
  lead: LeadDetail;
  legs: JourneyLeg[];
  enquiryId: string | null;
  quote: LeadDetailQuote | null;
  currentUserId: string;
  canAddEnquiry: boolean;
  canClaim: boolean;
  canRelease: boolean;
}) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isGeneralEnquiry = !lead.pickup_text && !lead.destination_text;
  const isOwnActiveLead = lead.assigned_user_id === currentUserId && lead.status !== "converted" && lead.status !== "closed";

  function claim() {
    setError(null);
    startTransition(async () => {
      const result = await claimLeadAction(lead.id);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead accepted and moved to your dashboard");
    });
  }

  function createQuote() {
    setError(null);
    startTransition(async () => {
      const result = await createEnquiryFromLeadAction(lead.id);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
      }
      // On success this redirects into /quotes/new.
    });
  }

  function release() {
    setError(null);
    startTransition(async () => {
      const result = await releaseLeadAction(lead.id);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead released back to the open pool");
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title={lead.customers?.company_name || lead.customers?.contact_name || "Lead details"}
        text={`${STATUS_LABEL[lead.status]} · ${SOURCE_LABEL[lead.source]}${lead.brands?.name ? ` · ${lead.brands.name}` : ""}`}
        action={
          <Link href="/leads" className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to Leads
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Lead" sub="Source, priority and ownership" />
            <div className="mt-4 text-sm">
              <Row label="Source" value={SOURCE_LABEL[lead.source]} />
              {lead.is_complex_booking && <Row label="Complex Booking" value="Yes — AI-assisted intake" />}
              <Row label="Brand / website" value={lead.brands?.name} />
              <Row label="Priority" value={lead.priority === "high" ? "High" : "Normal"} />
              <Row
                label="Owner"
                value={lead.profiles?.full_name || <span className="font-bold text-primary-600">Open pool</span>}
              />
              <Row label={isGeneralEnquiry ? "Message" : "Notes"} value={lead.notes} />
            </div>
          </Panel>

          {!isGeneralEnquiry && (
            <Panel>
              <SectionTitle title="Journey (as captured on intake)" sub="Raw pickup/destination text before an enquiry was created" />
              <div className="mt-4 text-sm">
                <Row label="Pickup" value={lead.pickup_text} />
                <Row label="Destination" value={lead.destination_text} />
                <WhenRow label="Travel date" date={lead.travel_date} time={lead.pickup_time} />
                {lead.return_trip && (
                  <WhenRow label="Return" date={lead.return_date} time={lead.return_time} />
                )}
                <Row label="Passengers" value={lead.passenger_count} />
                {lead.luggage_count !== null && <Row label="Luggage" value={lead.luggage_count} />}
                <Row label="Vehicle requested" value={lead.vehicle_requested} />
              </div>
            </Panel>
          )}

          <div className="flex flex-wrap gap-2">
            {lead.status === "open_pool" && canClaim && (
              <button
                type="button"
                disabled={pending}
                onClick={claim}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Please wait…" : "Claim this lead"}
              </button>
            )}
            {isOwnActiveLead && canAddEnquiry && (
              <button
                type="button"
                disabled={pending}
                onClick={createQuote}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Please wait…" : quote ? "Continue to Quote" : "Create Quote"}
              </button>
            )}
            {isOwnActiveLead && canRelease && (
              <button
                type="button"
                disabled={pending}
                onClick={release}
                className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
              >
                Release to open pool
              </button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Customer" sub="Linked customer record" />
            {lead.customers ? (
              <div className="mt-4 text-sm">
                <Row label="Name" value={lead.customers.company_name || lead.customers.contact_name} />
                <Row label="Email" value={lead.customers.email} />
                <Row label="Phone" value={lead.customers.phone} />
                <Link
                  href={`/customers/${lead.customers.id}`}
                  className="mt-3 inline-block rounded-xl border px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
                >
                  View customer record →
                </Link>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">No customer linked yet.</p>
            )}
          </Panel>

          {legs.length > 0 && (
            <Panel>
              <SectionTitle title="Journey legs" sub="Structured legs on the enquiry created from this lead" />
              <div className="mt-4">
                {legs.map((leg, i) => (
                  <JourneyLegDetail key={i} leg={leg} index={i} total={legs.length} />
                ))}
              </div>
            </Panel>
          )}

          {enquiryId && (
            <Panel>
              <SectionTitle title="Quote" />
              {quote ? (
                <Link
                  href={`/quotes/${quote.id}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
                >
                  {quote.quote_number} · {quote.status.replaceAll("_", " ")} →
                </Link>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No quote created yet for this enquiry.</p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
