"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { createClient } from "@/lib/supabase/client";
import {
  updateSupplierDetailsAction,
  addVehicleAction,
  removeVehicleAction,
  submitVerificationAction,
} from "./actions";
import type { Supplier, SupplierVehicle, SupplierDocument } from "@/lib/supabase/database.types";

const STATUS_TEXT: Record<Supplier["status"], string> = {
  invited: "Not submitted yet — fill in your details below and submit for review.",
  submitted: "Submitted — awaiting review by the operator.",
  approved: "Approved — you can now receive jobs.",
  rejected: "Rejected — update your details below and resubmit.",
  suspended: "Your account has been suspended.",
};

const STATUS_STYLE: Record<Supplier["status"], string> = {
  invited: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  suspended: "bg-amber-50 text-amber-700",
};

const inputClass =
  "mt-1.5 w-full rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50";
const labelClass = "text-xs font-bold uppercase tracking-wide text-slate-500";

export function VerificationForm({
  supplier,
  vehicles,
  documents,
}: {
  supplier: Supplier;
  vehicles: SupplierVehicle[];
  documents: SupplierDocument[];
}) {
  const notify = useToast();
  const router = useRouter();
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  function saveDetails(formData: FormData) {
    setDetailsError(null);
    startTransition(async () => {
      const result = await updateSupplierDetailsAction({ error: null }, formData);
      if (result?.error) {
        setDetailsError(result.error);
        return;
      }
      notify("Details saved");
    });
  }

  function addVehicle(formData: FormData) {
    setVehicleError(null);
    startTransition(async () => {
      const result = await addVehicleAction({ error: null }, formData);
      if (result?.error) {
        setVehicleError(result.error);
        return;
      }
      notify("Vehicle added");
      router.refresh();
    });
  }

  function removeVehicle(id: string) {
    startTransition(async () => {
      await removeVehicleAction(id);
      router.refresh();
    });
  }

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadLabel.trim()) {
      notify("Give the document a label first (e.g. Insurance Certificate)");
      e.target.value = "";
      return;
    }

    setUploading(true);
    const label = uploadLabel.trim();
    const supabase = createClient();
    const path = `${supplier.id}/${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("supplier-documents").upload(path, file);
    if (uploadError) {
      notify(uploadError.message);
      setUploading(false);
      e.target.value = "";
      return;
    }

    const { error: insertError } = await supabase.from("supplier_documents").insert({
      supplier_id: supplier.id,
      label,
      storage_path: path,
      file_name: file.name,
    });
    e.target.value = "";

    if (insertError) {
      notify(insertError.message);
      setUploading(false);
      return;
    }

    notify("Document uploaded");
    setUploadLabel("");
    setUploading(false);
    // Wrapped in startTransition, same as every other mutating handler above —
    // without it, this refresh runs as an urgent update, which makes React
    // unmount this form while refetching and remount it fresh once the data
    // arrives. That was wiping whatever was still typed (but not yet saved)
    // in the uncontrolled "Business details" inputs below.
    startTransition(() => {
      router.refresh();
    });
  }

  function submit() {
    startTransition(async () => {
      try {
        await submitVerificationAction();
        notify("Submitted for review");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not submit.");
      }
    });
  }

  // Business details, vehicles and documents stay editable at any status —
  // suppliers need to be able to update contact info, add vehicles, etc.
  // after approval too. Only the "submit for review" step is restricted to
  // pre-approval statuses, since an approved supplier has nothing to resubmit.
  const canEdit = true;
  const canSubmit = supplier.status === "invited" || supplier.status === "rejected";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${STATUS_STYLE[supplier.status]}`}>
        <span className="font-bold capitalize">{supplier.status}</span>
        <span className="text-right">{STATUS_TEXT[supplier.status]}</span>
      </div>

      <Panel className="p-4">
        <h2 className="text-sm font-black">Business details</h2>
        <form action={saveDetails} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Contact name
            <input name="contactName" defaultValue={supplier.contact_name ?? ""} disabled={!canEdit} className={inputClass} />
          </label>
          <label className={labelClass}>
            Phone
            <PhoneNumberField name="phone" defaultValue={supplier.phone} disabled={!canEdit} className="mt-1.5" />
          </label>
          <label className={labelClass}>
            WhatsApp
            <PhoneNumberField name="whatsapp" defaultValue={supplier.whatsapp} disabled={!canEdit} className="mt-1.5" />
          </label>
          <label className={labelClass}>
            Region / location covered
            <input name="region" defaultValue={supplier.region ?? ""} disabled={!canEdit} className={inputClass} />
          </label>
          <label className={labelClass}>
            Registration number
            <input name="registrationNumber" defaultValue={supplier.registration_number ?? ""} disabled={!canEdit} className={inputClass} />
          </label>
          <label className={labelClass}>
            VAT number
            <input name="vatNumber" defaultValue={supplier.vat_number ?? ""} disabled={!canEdit} className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Insurance details
            <textarea name="insuranceDetails" defaultValue={supplier.insurance_details ?? ""} disabled={!canEdit} className={`${inputClass} min-h-12`} />
          </label>
          <label className={labelClass}>
            Driver license number
            <input name="licenseNumber" defaultValue={supplier.license_number ?? ""} disabled={!canEdit} className={inputClass} />
          </label>
          {detailsError && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{detailsError}</div>}
          {canEdit && (
            <button type="submit" disabled={pending} className="sm:col-span-2 w-fit rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {pending ? "Saving…" : "Save details"}
            </button>
          )}
        </form>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-black">Vehicles <span className="font-normal text-slate-400">· {vehicles.length} added</span></h2>
        <div className="mt-3 space-y-1.5">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <div>
                <b>{v.vehicle_type}</b>
                {v.seat_capacity && <span className="text-slate-500"> · {v.seat_capacity} seats</span>}
                {v.plate_number && <span className="text-slate-500"> · {v.plate_number}</span>}
              </div>
              {canEdit && (
                <button onClick={() => removeVehicle(v.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove vehicle">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <form action={addVehicle} className="mt-3 grid gap-2 sm:grid-cols-4">
            <input name="vehicleType" placeholder="Vehicle type" required className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
            <input name="seatCapacity" type="number" min={1} placeholder="Seats" className="rounded-lg border px-3 py-2 text-sm" />
            <input name="plateNumber" placeholder="Plate number" className="rounded-lg border px-3 py-2 text-sm" />
            {vehicleError && <div className="sm:col-span-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{vehicleError}</div>}
            <button type="submit" disabled={pending} className="sm:col-span-4 w-fit rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-60">
              Add vehicle
            </button>
          </form>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-black">Documents <span className="font-normal text-slate-400">· {documents.length} uploaded</span></h2>
        <div className="mt-3 space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
              <FileText size={14} className="shrink-0 text-slate-400" />
              <div className="min-w-0">
                <b className="truncate">{doc.label}</b>
                <div className="truncate text-xs text-slate-500">{doc.file_name}</div>
              </div>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={uploadLabel}
              onChange={(e) => setUploadLabel(e.target.value)}
              placeholder="Document label (e.g. Insurance Certificate)"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <label className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-bold text-slate-500 hover:border-primary-300 hover:text-primary-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <Upload size={14} />
              {uploading ? "Uploading…" : "Choose file"}
              <input type="file" disabled={uploading} onChange={uploadDocument} className="hidden" />
            </label>
          </div>
        )}
      </Panel>

      {canSubmit && (
        <button onClick={submit} disabled={pending} className="w-full rounded-xl bg-primary-500 py-2.5 text-sm font-black text-white disabled:opacity-60">
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      )}
    </div>
  );
}
