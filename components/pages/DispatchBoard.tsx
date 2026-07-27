"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { assignSupplierAction, attachSupplierInvoiceAction } from "@/app/(staff)/dispatch/actions";
import type { JobStatus } from "@/lib/supabase/database.types";

export interface JobRow {
  id: string;
  status: JobStatus;
  region: string | null;
  offered_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  assigned_supplier_id: string | null;
  supplier_invoice_note: string | null;
  supplier_invoice_url: string | null;
  quotes: { quote_number: string; customers: { company_name: string | null; contact_name: string } | null } | null;
  suppliers: { name: string } | null;
}

export interface SupplierOption {
  id: string;
  name: string;
  region: string | null;
}

const STATUS_STYLE: Record<JobStatus, string> = {
  unassigned: "bg-slate-100 text-slate-600",
  offered: "bg-blue-50 text-blue-700",
  accepted_by_supplier: "bg-amber-50 text-amber-700",
  rejected_by_supplier: "bg-red-50 text-red-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function JobCard({ job, suppliers }: { job: JobRow; suppliers: SupplierOption[] }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(
    suppliers.find((s) => s.region && job.region?.toLowerCase().includes(s.region.toLowerCase()))?.id ?? suppliers[0]?.id ?? "",
  );
  const [note, setNote] = useState(job.supplier_invoice_note ?? "");
  const [url, setUrl] = useState(job.supplier_invoice_url ?? "");

  function assign() {
    if (!supplierId) return;
    startTransition(async () => {
      try {
        await assignSupplierAction(job.id, supplierId);
        notify("Job offered to supplier");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not assign the supplier.");
      }
    });
  }

  function saveInvoice() {
    startTransition(async () => {
      try {
        await attachSupplierInvoiceAction(job.id, note, url);
        notify("Invoice reference saved");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the invoice reference.");
      }
    });
  }

  const customer = job.quotes?.customers;

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
          <div className="text-xs text-slate-500">
            {job.quotes?.quote_number} · {job.region ?? "No region"}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[job.status]}`}>
          {job.status.replaceAll("_", " ")}
        </span>
      </div>

      {(job.status === "unassigned" || job.status === "rejected_by_supplier") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {suppliers.length === 0 && <option value="">No approved suppliers</option>}
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.region ? `(${s.region})` : ""}
              </option>
            ))}
          </select>
          <button
            disabled={pending || !supplierId}
            onClick={assign}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            Offer job
          </button>
        </div>
      )}

      {job.suppliers && job.status !== "unassigned" && (
        <p className="mt-2 text-xs text-slate-500">Assigned to: {job.suppliers.name}</p>
      )}

      {job.status === "completed" && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="text-xs font-bold text-slate-500">Supplier invoice (paid outside the CRM)</div>
          <div className="flex flex-wrap gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Invoice note"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Invoice link (optional)"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              disabled={pending}
              onClick={saveInvoice}
              className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DispatchBoard({ jobs, suppliers }: { jobs: JobRow[]; suppliers: SupplierOption[] }) {
  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Dispatch"
        text="Assign paid bookings to an approved supplier, manually and region-suggested."
      />
      <Panel>
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} suppliers={suppliers} />
          ))}
          {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No jobs yet — they appear once a quote is marked as paid.</p>}
        </div>
      </Panel>
    </div>
  );
}
