"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { attachSupplierInvoiceAction } from "@/app/(staff)/dispatch/actions";
import type { JobOfferStatus, JobStatus } from "@/lib/supabase/database.types";

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
  job_offers: { id: string; status: JobOfferStatus; suppliers: { name: string } | null }[];
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

function offersSummary(job: JobRow) {
  if (job.suppliers) return `Assigned to ${job.suppliers.name}`;
  const live = job.job_offers.filter((o) => o.status === "sent");
  if (live.length > 0) return `${live.length} offer${live.length === 1 ? "" : "s"} pending`;
  if (job.status === "unassigned") return "Not yet offered";
  return null;
}

function JobCard({ job }: { job: JobRow }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(job.supplier_invoice_note ?? "");
  const [url, setUrl] = useState(job.supplier_invoice_url ?? "");

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
  const summary = offersSummary(job);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
          <div className="text-xs text-slate-500">
            {job.quotes?.quote_number} · {job.region ?? "No region"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[job.status]}`}>
            {job.status.replaceAll("_", " ")}
          </span>
          <Link
            href={`/dispatch/${job.id}`}
            className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
          >
            View
          </Link>
        </div>
      </div>

      {summary && <p className="mt-2 text-xs text-slate-500">{summary}</p>}

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

export function DispatchBoard({
  jobs,
  page,
  pageSize,
  total,
}: {
  jobs: JobRow[];
  page: number;
  pageSize: number;
  total: number;
}) {
  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Dispatch"
        text="Assign paid bookings to one or more approved suppliers — whoever accepts first gets the job. Open a job to search suppliers and offer it."
      />
      <Panel>
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No jobs yet — they appear once a quote is marked as paid.</p>}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>
    </div>
  );
}
