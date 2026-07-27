"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { respondToJobAction, confirmJobAction, completeJobAction } from "@/app/supplier/dashboard/actions";
import type { JobOfferView, JobStatus } from "@/lib/supabase/database.types";

const STATUS_LABEL: Record<JobStatus, string> = {
  unassigned: "Unassigned",
  offered: "New offer",
  accepted_by_supplier: "Accepted — confirm to see full details",
  rejected_by_supplier: "Rejected",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function JobOfferCard({ job }: { job: JobOfferView }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function respond(decision: "accepted_by_supplier" | "rejected_by_supplier") {
    startTransition(async () => {
      try {
        await respondToJobAction(job.id, decision);
        notify(decision === "accepted_by_supplier" ? "Accepted — please confirm to reveal full details" : "Job rejected");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update this job.");
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      try {
        await confirmJobAction(job.id);
        notify("Job confirmed — full details below");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not confirm this job.");
      }
    });
  }

  function complete() {
    startTransition(async () => {
      try {
        await completeJobAction(job.id);
        notify("Job marked as completed");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not complete this job.");
      }
    });
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{job.region ?? "Region not set"}</b>
          <div className="text-xs text-slate-500">
            {job.pickup_date ?? "Date TBC"} {job.pickup_time ?? ""} · {job.passenger_count ?? "?"} passengers
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{STATUS_LABEL[job.status]}</span>
      </div>

      {(job.status === "confirmed" || job.status === "completed") && (
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div>
            <span className="text-slate-500">Pickup: </span>
            <b>{job.pickup_address}</b>
          </div>
          <div>
            <span className="text-slate-500">Destination: </span>
            <b>{job.destination_address}</b>
          </div>
          <div>
            <span className="text-slate-500">Customer: </span>
            <b>{job.customer_name}</b>
          </div>
          {job.customer_phone && (
            <div>
              <span className="text-slate-500">Phone: </span>
              <b>{job.customer_phone}</b>
            </div>
          )}
        </div>
      )}

      {job.status === "offered" && (
        <div className="mt-3 flex gap-2">
          <button
            disabled={pending}
            onClick={() => respond("accepted_by_supplier")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            Accept
          </button>
          <button
            disabled={pending}
            onClick={() => respond("rejected_by_supplier")}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {job.status === "accepted_by_supplier" && (
        <div className="mt-3">
          <button
            disabled={pending}
            onClick={confirm}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            Confirm this job
          </button>
        </div>
      )}

      {job.status === "confirmed" && (
        <div className="mt-3">
          <button
            disabled={pending}
            onClick={complete}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            Mark Completed
          </button>
        </div>
      )}

      {job.status === "completed" && (job.supplier_invoice_note || job.supplier_invoice_url) && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
          <div className="font-bold text-slate-600">Payment reference from admin</div>
          {job.supplier_invoice_note && <p className="mt-1">{job.supplier_invoice_note}</p>}
          {job.supplier_invoice_url && (
            <a href={job.supplier_invoice_url} target="_blank" rel="noreferrer" className="mt-1 block font-bold text-primary-600">
              View invoice
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function SupplierDashboard({ jobs }: { jobs: JobOfferView[] }) {
  return (
    <div>
      <PageHead eyebrow="Supplier Portal" title="Your jobs" text="Jobs offered to you — accept, confirm and complete." />
      <Panel>
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobOfferCard key={job.id} job={job} />
          ))}
          {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No jobs offered yet.</p>}
        </div>
      </Panel>
    </div>
  );
}
