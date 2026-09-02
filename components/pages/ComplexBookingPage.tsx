"use client";

import { useState, useTransition } from "react";
import { Wand2, Plus, Trash2, Upload, FileText, X, Loader2 } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  extractComplexBookingAction,
  createComplexBookingLeadAction,
  type ComplexBookingFileRef,
  type ComplexBookingLegInput,
} from "@/app/(staff)/leads/complex-booking/actions";
import type { JourneyType } from "@/lib/supabase/database.types";

interface CustomerOption {
  id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
}

interface EditableLeg {
  clientId: string;
  journeyType: JourneyType;
  pickupAddress: string;
  destinationAddress: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  passengers: number;
  luggage: number;
  vehicleDescription: string;
  wheelchair: boolean;
  childSeats: number;
  specialRequirements: string;
}

function blankLeg(): EditableLeg {
  return {
    clientId: crypto.randomUUID(),
    journeyType: "one_way",
    pickupAddress: "",
    destinationAddress: "",
    pickupDate: "",
    pickupTime: "",
    returnDate: "",
    returnTime: "",
    passengers: 1,
    luggage: 0,
    vehicleDescription: "",
    wheelchair: false,
    childSeats: 0,
    specialRequirements: "",
  };
}

export function ComplexBookingPage({
  customers,
}: {
  customers: CustomerOption[];
}) {
  const notify = useToast();
  const [phase, setPhase] = useState<"input" | "review">("input");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<ComplexBookingFileRef | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [existingCustomerId, setExistingCustomerId] = useState(customers[0]?.id ?? "");
  const [newCustomer, setNewCustomer] = useState({ contactName: "", companyName: "", email: "", phone: "" });
  const [legs, setLegs] = useState<EditableLeg[]>([]);
  const [internalNotes, setInternalNotes] = useState("");

  const selectedCustomer = customers.find((c) => c.id === existingCustomerId);

  async function onFileSelected(selected: File | null) {
    if (!selected) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired — please sign in again.");

      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
      if (!profile) throw new Error("Could not resolve your tenant.");

      const path = `${profile.tenant_id}/complex-booking/${crypto.randomUUID()}-${selected.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, selected);
      if (uploadError) throw new Error(uploadError.message);

      setFile({ storagePath: path, fileName: selected.name, mimeType: selected.type });
      setFileLabel(selected.name);
      setFileSize(selected.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this file.");
      setFile(null);
      setFileLabel(null);
      setFileSize(null);
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    setFile(null);
    setFileLabel(null);
    setFileSize(null);
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function extract() {
    setError(null);
    startTransition(async () => {
      const result = await extractComplexBookingAction({ pastedText, file });
      if (result.error || !result.data) {
        setError(result.error ?? "Could not read this itinerary.");
        return;
      }

      const c = result.data.customer;
      if (c.name || c.company || c.email || c.phone) {
        setCustomerMode("new");
        setNewCustomer({ contactName: c.name ?? "", companyName: c.company ?? "", email: c.email ?? "", phone: c.phone ?? "" });
      }

      setLegs(
        result.data.legs.map((leg) => ({
          clientId: crypto.randomUUID(),
          journeyType: leg.journey_type,
          pickupAddress: leg.pickup_address,
          destinationAddress: leg.destination_address,
          pickupDate: leg.pickup_date ?? "",
          pickupTime: leg.pickup_time ?? "",
          returnDate: leg.return_date ?? "",
          returnTime: leg.return_time ?? "",
          passengers: leg.passenger_count ?? 1,
          luggage: leg.luggage_count ?? 0,
          vehicleDescription: leg.vehicle_notes ?? "",
          wheelchair: false,
          childSeats: 0,
          specialRequirements: leg.special_requirements ?? "",
        })),
      );
      setInternalNotes(result.data.internal_notes ?? "");
      notify(`AI found ${result.data.legs.length} leg${result.data.legs.length === 1 ? "" : "s"} — review before creating the lead`);
      setPhase("review");
    });
  }

  function updateLeg(clientId: string, patch: Partial<EditableLeg>) {
    setLegs((prev) => prev.map((l) => (l.clientId === clientId ? { ...l, ...patch } : l)));
  }

  function removeLeg(clientId: string) {
    setLegs((prev) => prev.filter((l) => l.clientId !== clientId));
  }

  function submit() {
    setError(null);
    if (legs.length === 0) {
      setError("Add at least one journey leg.");
      return;
    }
    for (const leg of legs) {
      if (!leg.pickupAddress.trim() || !leg.destinationAddress.trim()) {
        setError("Every leg needs a pickup and destination address.");
        return;
      }
    }

    const legInputs: ComplexBookingLegInput[] = legs.map((l) => ({
      journeyType: l.journeyType,
      pickupAddress: l.pickupAddress.trim(),
      destinationAddress: l.destinationAddress.trim(),
      pickupDate: l.pickupDate || null,
      pickupTime: l.pickupTime || null,
      returnDate: l.returnDate || null,
      returnTime: l.returnTime || null,
      passengerCount: l.passengers || null,
      luggageCount: l.luggage || null,
      vehicleDescription: l.vehicleDescription.trim() || null,
      wheelchairRequired: l.wheelchair,
      childSeats: l.childSeats,
      specialRequirements: l.specialRequirements.trim() || null,
    }));

    startTransition(async () => {
      const result = await createComplexBookingLeadAction({
        existingCustomerId: customerMode === "existing" ? existingCustomerId : null,
        newCustomer: customerMode === "new" ? newCustomer : null,
        legs: legInputs,
        internalNotes: internalNotes.trim() || null,
        pastedText: pastedText.trim() || null,
        sourceFile: file,
      });
      if (result?.error) setError(result.error);
      // On success this redirects into /quotes/new — nothing else to do here.
    });
  }

  if (phase === "input") {
    return (
      <div>
        <SectionTitle title="Paste itinerary or upload a quote" sub="AI will read it and build the journey legs for you to review" />
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-bold">
            Pasted itinerary text
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste an email, itinerary, or quote request here…"
              className="mt-2 min-h-40 w-full rounded-xl border px-3 py-3 text-base font-normal sm:text-sm"
            />
          </label>

          <div>
            <span className="block text-sm font-bold">Or upload a quote file</span>

            {fileLabel ? (
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-700">{fileLabel}</div>
                  {fileSize !== null && <div className="text-xs text-slate-400">{formatFileSize(fileSize)}</div>}
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  aria-label="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label
                className={
                  "mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/40 sm:flex-row sm:justify-start sm:px-5 sm:py-4 sm:text-left " +
                  (uploading ? "pointer-events-none opacity-60" : "")
                }
              >
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-700">{uploading ? "Uploading…" : "Choose a file"}</div>
                  <div className="text-xs text-slate-400">PDF, Word (.docx) or an image of a quote</div>
                </div>
              </label>
            )}
          </div>

          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

          <button
            type="button"
            disabled={pending || uploading || (!pastedText.trim() && !file)}
            onClick={extract}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <Wand2 size={16} />
            {pending ? "Reading itinerary…" : "Extract with AI"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionTitle title="Review & edit" sub="Correct anything the AI missed, then create the lead" />
        <button type="button" onClick={() => setPhase("input")} className="text-xs font-bold text-primary-600">
          ← Start over
        </button>
      </div>

      <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Customer</div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setCustomerMode("existing")}
          className={"rounded-xl px-3 py-2 text-sm font-bold " + (customerMode === "existing" ? "bg-primary-500 text-white" : "bg-slate-100")}
        >
          Existing customer
        </button>
        <button
          type="button"
          onClick={() => setCustomerMode("new")}
          className={"rounded-xl px-3 py-2 text-sm font-bold " + (customerMode === "new" ? "bg-primary-500 text-white" : "bg-slate-100")}
        >
          New customer
        </button>
      </div>
      {customerMode === "existing" ? (
        <div className="mt-3">
          <select
            value={existingCustomerId}
            onChange={(e) => setExistingCustomerId(e.target.value)}
            className="w-full rounded-xl border px-3 py-3"
          >
            {customers.length === 0 && <option value="">No customers yet</option>}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.contact_name} {c.email ? `(${c.email})` : ""}
              </option>
            ))}
          </select>
          {selectedCustomer && <p className="mt-2 text-sm text-slate-500">{selectedCustomer.contact_name}</p>}
        </div>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Contact name
            <input
              value={newCustomer.contactName}
              onChange={(e) => setNewCustomer({ ...newCustomer, contactName: e.target.value })}
              className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Company name
            <input
              value={newCustomer.companyName}
              onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
              className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Email
            <input
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Phone
            <PhoneNumberField value={newCustomer.phone} onChange={(v) => setNewCustomer({ ...newCustomer, phone: v ?? "" })} className="mt-2" />
          </label>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wide text-primary-500">Journey legs ({legs.length})</div>
        <button
          type="button"
          onClick={() => setLegs((prev) => [...prev, blankLeg()])}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600"
        >
          <Plus size={13} />
          Add leg
        </button>
      </div>

      <div className="mt-3 space-y-4">
        {legs.map((leg, i) => (
          <div key={leg.clientId} className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <b className="text-sm">Leg {i + 1}</b>
              <button
                type="button"
                onClick={() => removeLeg(leg.clientId)}
                className="shrink-0 rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                aria-label="Remove leg"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-bold">
                Journey type
                <select
                  value={leg.journeyType}
                  onChange={(e) => updateLeg(leg.clientId, { journeyType: e.target.value as JourneyType })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                >
                  <option value="one_way">One way</option>
                  <option value="return">Return</option>
                  <option value="disposal">Disposal hire</option>
                  <option value="multi_day">Multi-day</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Pickup date
                <input
                  type="date"
                  value={leg.pickupDate}
                  onChange={(e) => updateLeg(leg.clientId, { pickupDate: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Pickup address
                <input
                  value={leg.pickupAddress}
                  onChange={(e) => updateLeg(leg.clientId, { pickupAddress: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Destination
                <input
                  value={leg.destinationAddress}
                  onChange={(e) => updateLeg(leg.clientId, { destinationAddress: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Pickup time
                <input
                  type="time"
                  value={leg.pickupTime}
                  onChange={(e) => updateLeg(leg.clientId, { pickupTime: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              {leg.journeyType === "return" && (
                <>
                  <label className="text-sm font-bold">
                    Return date
                    <input
                      type="date"
                      value={leg.returnDate}
                      onChange={(e) => updateLeg(leg.clientId, { returnDate: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                    />
                  </label>
                  <label className="text-sm font-bold">
                    Return time
                    <input
                      type="time"
                      value={leg.returnTime}
                      onChange={(e) => updateLeg(leg.clientId, { returnTime: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                    />
                  </label>
                </>
              )}
              <label className="text-sm font-bold">
                Passengers
                <input
                  type="number"
                  min={1}
                  value={leg.passengers}
                  onChange={(e) => updateLeg(leg.clientId, { passengers: Number(e.target.value) })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Luggage
                <input
                  type="number"
                  min={0}
                  value={leg.luggage}
                  onChange={(e) => updateLeg(leg.clientId, { luggage: Number(e.target.value) })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Vehicle type
                <input
                  type="text"
                  value={leg.vehicleDescription}
                  onChange={(e) => updateLeg(leg.clientId, { vehicleDescription: e.target.value })}
                  placeholder="e.g. 45-seat coach, SUV, minivan"
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Child seats
                <input
                  type="number"
                  min={0}
                  value={leg.childSeats}
                  onChange={(e) => updateLeg(leg.clientId, { childSeats: Number(e.target.value) })}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={leg.wheelchair}
                  onChange={(e) => updateLeg(leg.clientId, { wheelchair: e.target.checked })}
                  className="h-4 w-4"
                />
                Wheelchair accessible required
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Special requirements
                <textarea
                  value={leg.specialRequirements}
                  onChange={(e) => updateLeg(leg.clientId, { specialRequirements: e.target.value })}
                  className="mt-1.5 min-h-16 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
            </div>
          </div>
        ))}
        {legs.length === 0 && (
          <p className="rounded-xl bg-slate-50 py-6 text-center text-sm text-slate-500">No legs yet — add one to continue.</p>
        )}
      </div>

      <label className="mt-5 block text-sm font-bold">
        Internal notes
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          className="mt-2 min-h-20 w-full rounded-xl border px-3 py-3 font-normal"
        />
      </label>

      {error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-6 flex justify-end border-t pt-5">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create Lead & Continue to Quote"}
        </button>
      </div>
    </div>
  );
}
