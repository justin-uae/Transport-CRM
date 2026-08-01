"use client";

import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { InvoiceUploadForm } from "@/app/supplier/dashboard/InvoiceUploadForm";
import { acceptJobOfferAction, rejectJobOfferAction, confirmJobAction, completeJobAction } from "@/app/supplier/dashboard/actions";
import type { JobOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

function statusLabel(job: JobOfferView) {
  if (job.offer_status === "withdrawn") return "Offer withdrawn — assigned to another supplier";
  if (job.offer_status === "rejected") return "You rejected this job";
  if (job.offer_status === "sent") return "New offer";
  // offer_status === "accepted" — follow the job's own progress from here.
  switch (job.job_status) {
    case "accepted_by_supplier":
      return "Accepted — confirm to see full details";
    case "confirmed":
      return "Confirmed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return job.job_status;
  }
}

const TABS = ["active", "all", "completed", "rejected"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  active: "Active",
  all: "All Jobs",
  completed: "Completed",
  rejected: "Rejected / Withdrawn",
};

function isActive(job: JobOfferView) {
  return (
    job.offer_status === "sent" ||
    (job.offer_status === "accepted" && (job.job_status === "accepted_by_supplier" || job.job_status === "confirmed"))
  );
}

function isRejectedOrWithdrawn(job: JobOfferView) {
  return job.offer_status === "rejected" || job.offer_status === "withdrawn";
}

function JobOfferCard({ job, supplierId, invoice }: { job: JobOfferView; supplierId: string; invoice: JobSupplierInvoice | null }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      try {
        await acceptJobOfferAction(job.job_id);
        notify("Accepted — please confirm to reveal full details");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not accept this job.");
      }
    });
  }

  function reject() {
    startTransition(async () => {
      try {
        await rejectJobOfferAction(job.job_id);
        notify("Job rejected");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not reject this job.");
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      try {
        await confirmJobAction(job.job_id);
        notify("Job confirmed — full details below");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not confirm this job.");
      }
    });
  }

  function complete() {
    startTransition(async () => {
      try {
        await completeJobAction(job.job_id);
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
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{statusLabel(job)}</span>
      </div>

      {(job.job_status === "confirmed" || job.job_status === "completed") && (
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

      {job.offer_status === "sent" && (
        <div className="mt-3 flex gap-2">
          <button
            disabled={pending}
            onClick={accept}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            Accept
          </button>
          <button
            disabled={pending}
            onClick={reject}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {job.offer_status === "accepted" && job.job_status === "accepted_by_supplier" && (
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

      {job.job_status === "confirmed" && (
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

      {job.job_status === "completed" && (job.supplier_invoice_note || job.supplier_invoice_url) && (
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

      {(job.job_status === "confirmed" || job.job_status === "completed") && (
        <InvoiceUploadForm
          jobId={job.job_id}
          supplierId={supplierId}
          invoice={invoice}
          prefillAmount={job.supplier_estimated_cost}
          prefillCurrency={job.quote_currency}
        />
      )}
    </div>
  );
}

export function SupplierDashboard({
  jobs,
  invoices,
  supplierId,
}: {
  jobs: JobOfferView[];
  invoices: JobSupplierInvoice[];
  supplierId: string;
}) {
  const [tab, setTab] = useState<Tab>("active");

  const invoiceByJobId = useMemo(() => {
    const map = new Map<string, JobSupplierInvoice>();
    for (const inv of invoices) map.set(inv.job_id, inv);
    return map;
  }, [invoices]);

  const visible = useMemo(() => {
    switch (tab) {
      case "active":
        return jobs.filter(isActive);
      case "completed":
        return jobs.filter((j) => j.job_status === "completed");
      case "rejected":
        return jobs.filter(isRejectedOrWithdrawn);
      default:
        return jobs;
    }
  }, [jobs, tab]);

  return (
    <div>
      <PageHead eyebrow="Supplier Portal" title="Your jobs" text="Jobs offered to you — accept, confirm, complete and invoice." />
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-xl px-3 py-2 text-sm font-bold " +
              (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
            }
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <Panel>
        <div className="space-y-3">
          {visible.map((job) => (
            <JobOfferCard key={job.offer_id} job={job} supplierId={supplierId} invoice={invoiceByJobId.get(job.job_id) ?? null} />
          ))}
          {visible.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No jobs here.</p>}
        </div>
      </Panel>
    </div>
  );
}
