"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
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
      label: uploadLabel.trim(),
      storage_path: path,
      file_name: file.name,
    });
    setUploading(false);
    e.target.value = "";

    if (insertError) {
      notify(insertError.message);
      return;
    }

    notify("Document uploaded");
    setUploadLabel("");
    router.refresh();
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
    <div className="space-y-5">
      <Panel>
        <div className="flex items-center justify-between">
          <SectionTitle title="Verification status" />
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize">{supplier.status}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{STATUS_TEXT[supplier.status]}</p>
      </Panel>

      <Panel>
        <SectionTitle title="Business details" />
        <form action={saveDetails} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Contact name
            <input name="contactName" defaultValue={supplier.contact_name ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold">
            Phone
            <input name="phone" defaultValue={supplier.phone ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold">
            WhatsApp
            <input name="whatsapp" defaultValue={supplier.whatsapp ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold">
            Region / location covered
            <input name="region" defaultValue={supplier.region ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold">
            Registration number
            <input name="registrationNumber" defaultValue={supplier.registration_number ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold">
            VAT number
            <input name="vatNumber" defaultValue={supplier.vat_number ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            Insurance details
            <textarea name="insuranceDetails" defaultValue={supplier.insurance_details ?? ""} disabled={!canEdit} className="mt-2 min-h-16 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          <label className="text-sm font-bold">
            Driver license number
            <input name="licenseNumber" defaultValue={supplier.license_number ?? ""} disabled={!canEdit} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50" />
          </label>
          {detailsError && <div className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{detailsError}</div>}
          {canEdit && (
            <button type="submit" disabled={pending} className="sm:col-span-2 w-fit rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {pending ? "Saving…" : "Save details"}
            </button>
          )}
        </form>
      </Panel>

      <Panel>
        <SectionTitle title="Vehicles" sub={`${vehicles.length} added`} />
        <div className="mt-4 space-y-2">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <div>
                <b>{v.vehicle_type}</b>
                {v.seat_capacity && <span className="text-slate-500"> · {v.seat_capacity} seats</span>}
                {v.plate_number && <span className="text-slate-500"> · {v.plate_number}</span>}
              </div>
              {canEdit && (
                <button onClick={() => removeVehicle(v.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove vehicle">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <form action={addVehicle} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input name="vehicleType" placeholder="Vehicle type" required className="rounded-xl border px-3 py-2.5 text-sm sm:col-span-2" />
            <input name="seatCapacity" type="number" min={1} placeholder="Seats" className="rounded-xl border px-3 py-2.5 text-sm" />
            <input name="plateNumber" placeholder="Plate number" className="rounded-xl border px-3 py-2.5 text-sm" />
            {vehicleError && <div className="sm:col-span-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{vehicleError}</div>}
            <button type="submit" disabled={pending} className="sm:col-span-4 w-fit rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60">
              Add vehicle
            </button>
          </form>
        )}
      </Panel>

      <Panel>
        <SectionTitle title="Documents" sub={`${documents.length} uploaded`} />
        <div className="mt-4 space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
              <FileText size={16} className="shrink-0 text-slate-400" />
              <div>
                <b>{doc.label}</b>
                <div className="text-xs text-slate-500">{doc.file_name}</div>
              </div>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={uploadLabel}
              onChange={(e) => setUploadLabel(e.target.value)}
              placeholder="Document label (e.g. Insurance Certificate)"
              className="rounded-xl border px-3 py-2.5 text-sm"
            />
            <input type="file" disabled={uploading} onChange={uploadDocument} className="text-sm" />
          </div>
        )}
      </Panel>

      {canSubmit && (
        <button onClick={submit} disabled={pending} className="w-full rounded-xl bg-primary-500 py-3 text-sm font-black text-white disabled:opacity-60">
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      )}
    </div>
  );
}
