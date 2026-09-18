"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import { LeadEditHistory, type LeadEditRecord } from "@/components/pages/LeadEditHistory";
import { claimLeadAction, createEnquiryFromLeadAction, releaseLeadAction, editLeadAction, type EditLeadInput } from "@/app/(staff)/leads/actions";
import { updateCustomerAction } from "@/app/(staff)/customers/actions";
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

export interface LeadSourceDocument {
  fileName: string;
  downloadUrl: string | null;
}

export function LeadDetailPage({
  lead,
  legs,
  enquiryId,
  quote,
  sourceDocument,
  edits,
  currentUserId,
  canAddEnquiry,
  canClaim,
  canRelease,
  canEditCustomer,
}: {
  lead: LeadDetail;
  legs: JourneyLeg[];
  enquiryId: string | null;
  quote: LeadDetailQuote | null;
  sourceDocument: LeadSourceDocument | null;
  edits: LeadEditRecord[];
  currentUserId: string;
  canAddEnquiry: boolean;
  canClaim: boolean;
  canRelease: boolean;
  canEditCustomer: boolean;
}) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [pickupText, setPickupText] = useState(lead.pickup_text ?? "");
  const [destinationText, setDestinationText] = useState(lead.destination_text ?? "");
  const [travelDate, setTravelDate] = useState(lead.travel_date ?? "");
  const [pickupTime, setPickupTime] = useState(lead.pickup_time ?? "");
  const [returnTrip, setReturnTrip] = useState(lead.return_trip);
  const [returnDate, setReturnDate] = useState(lead.return_date ?? "");
  const [returnTime, setReturnTime] = useState(lead.return_time ?? "");
  const [passengerCount, setPassengerCount] = useState(lead.passenger_count != null ? String(lead.passenger_count) : "");
  const [luggageCount, setLuggageCount] = useState(lead.luggage_count != null ? String(lead.luggage_count) : "");
  const [vehicleRequested, setVehicleRequested] = useState(lead.vehicle_requested ?? "");
  const [notesInput, setNotesInput] = useState(lead.notes ?? "");
  const [customerContactName, setCustomerContactName] = useState(lead.customers?.contact_name ?? "");
  const [customerCompanyName, setCustomerCompanyName] = useState(lead.customers?.company_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(lead.customers?.email ?? "");
  const [customerPhone, setCustomerPhone] = useState(lead.customers?.phone ?? "");

  const isOwnActiveLead = lead.assigned_user_id === currentUserId && lead.status !== "converted" && lead.status !== "closed";
  const showCustomerFields = (canEditCustomer || isOwnActiveLead) && !!lead.customers;

  const isGeneralEnquiry = !lead.pickup_text && !lead.destination_text;

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

  function saveEdit() {
    if (!editReason.trim()) {
      setEditError("A reason is required.");
      return;
    }
    const input: EditLeadInput = { reason: editReason };
    if (pickupText !== (lead.pickup_text ?? "")) input.pickupText = pickupText || null;
    if (destinationText !== (lead.destination_text ?? "")) input.destinationText = destinationText || null;
    if (travelDate !== (lead.travel_date ?? "")) input.travelDate = travelDate || null;
    if (pickupTime !== (lead.pickup_time ?? "")) input.pickupTime = pickupTime || null;
    if (returnTrip !== lead.return_trip) input.returnTrip = returnTrip;
    if (returnDate !== (lead.return_date ?? "")) input.returnDate = returnDate || null;
    if (returnTime !== (lead.return_time ?? "")) input.returnTime = returnTime || null;
    const passengerNum = passengerCount === "" ? null : Number(passengerCount);
    if (passengerNum !== lead.passenger_count) input.passengerCount = passengerNum;
    const luggageNum = luggageCount === "" ? null : Number(luggageCount);
    if (luggageNum !== lead.luggage_count) input.luggageCount = luggageNum;
    if (vehicleRequested !== (lead.vehicle_requested ?? "")) input.vehicleRequested = vehicleRequested || null;
    if (notesInput !== (lead.notes ?? "")) input.notes = notesInput || null;

    const customerInput: { reason: string; contactName?: string; companyName?: string | null; email?: string | null; phone?: string | null } = {
      reason: editReason,
    };
    if (showCustomerFields) {
      if (!customerContactName.trim()) {
        setEditError("Customer contact name can't be empty.");
        return;
      }
      if (customerContactName !== (lead.customers?.contact_name ?? "")) customerInput.contactName = customerContactName;
      if (customerCompanyName !== (lead.customers?.company_name ?? "")) customerInput.companyName = customerCompanyName || null;
      if (customerEmail !== (lead.customers?.email ?? "")) customerInput.email = customerEmail || null;
      if (customerPhone !== (lead.customers?.phone ?? "")) customerInput.phone = customerPhone || null;
    }
    const hasLeadChanges = Object.keys(input).length > 1;
    const hasCustomerChanges = Object.keys(customerInput).length > 1;

    if (!hasLeadChanges && !hasCustomerChanges) {
      setEditError("Change at least one field.");
      return;
    }

    setEditError(null);
    startTransition(async () => {
      if (hasLeadChanges) {
        const result = await editLeadAction(lead.id, input);
        if (result?.error) {
          setEditError(result.error);
          notify(result.error);
          return;
        }
      }
      if (hasCustomerChanges && lead.customers) {
        const result = await updateCustomerAction(lead.customers.id, customerInput, lead.id);
        if (result?.error) {
          setEditError(result.error);
          notify(result.error);
          return;
        }
      }
      notify("Lead updated");
      setEditOpen(false);
      setEditReason("");
      router.refresh();
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

  const leadLabel =
    lead.customers?.company_name ||
    lead.customers?.contact_name ||
    (lead.pickup_text && lead.destination_text ? `${lead.pickup_text} → ${lead.destination_text}` : "Lead details");

  return (
    <div>
      <Breadcrumb items={[{ label: "Customer Leads", href: "/leads" }, { label: leadLabel }]} />
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title={lead.customers?.company_name || lead.customers?.contact_name || "Lead details"}
        text={`${STATUS_LABEL[lead.status]} · ${SOURCE_LABEL[lead.source]}${lead.brands?.name ? ` · ${lead.brands.name}` : ""}`}
        action={<BackLink fallbackHref="/leads" label="Back to Leads" />}
      />

      {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Lead" sub="Source, priority and ownership" />
            <div className="mt-4 text-sm">
              <Row label="Source" value={SOURCE_LABEL[lead.source]} />
              {lead.is_complex_booking && <Row label="Complex Booking" value="Yes — AI-assisted intake" />}
              {lead.is_complex_booking && (
                <Row
                  label="Source document"
                  value={
                    sourceDocument ? (
                      sourceDocument.downloadUrl ? (
                        <a href={sourceDocument.downloadUrl} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                          {sourceDocument.fileName}
                        </a>
                      ) : (
                        sourceDocument.fileName
                      )
                    ) : (
                      "Pasted text only, no file uploaded"
                    )
                  }
                />
              )}
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
            {isOwnActiveLead && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditError(null);
                  setEditOpen(true);
                }}
                className="rounded-xl border px-5 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                Edit Lead
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

          <LeadEditHistory edits={edits} />
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

      {editOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setEditOpen(false)}
          title="Edit this lead"
          description={
            showCustomerFields
              ? "Correct the journey/intake details or the linked customer's name/contact info — every change here is logged with the reason below."
              : "Correct the journey/intake details captured on this lead — every change here is logged with the reason below."
          }
          pending={pending}
          error={editError}
          confirmLabel="Save Changes"
          onConfirm={saveEdit}
        >
          <div className="space-y-4">
            <label className="block text-sm font-bold">
              Reason (required)
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                placeholder="Why is this lead being edited?"
              />
            </label>

            {showCustomerFields && (
              <div className="rounded-xl border border-dashed p-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Customer details</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Contact name
                    <input
                      value={customerContactName}
                      onChange={(e) => setCustomerContactName(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Company name
                    <input
                      value={customerCompanyName}
                      onChange={(e) => setCustomerCompanyName(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Email
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Phone
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                Pickup
                <input
                  value={pickupText}
                  onChange={(e) => setPickupText(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Destination
                <input
                  value={destinationText}
                  onChange={(e) => setDestinationText(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Travel date
                <input
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Pickup time
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Passengers
                <input
                  type="number"
                  min={0}
                  value={passengerCount}
                  onChange={(e) => setPassengerCount(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Luggage
                <input
                  type="number"
                  min={0}
                  value={luggageCount}
                  onChange={(e) => setLuggageCount(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold sm:col-span-2">
                Vehicle requested
                <input
                  value={vehicleRequested}
                  onChange={(e) => setVehicleRequested(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={returnTrip} onChange={(e) => setReturnTrip(e.target.checked)} />
              Return trip
            </label>

            {returnTrip && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Return date
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Return time
                  <input
                    type="time"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>
            )}

            <label className="block text-sm font-bold">
              {isGeneralEnquiry ? "Message" : "Notes"}
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
              />
            </label>
          </div>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
