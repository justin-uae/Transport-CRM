"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import type { JobOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

function statusLabel(job: JobOfferView) {
  if (job.offer_status === "withdrawn") return "Offer withdrawn — assigned to another supplier";
  if (job.offer_status === "rejected") return "You rejected this job";
  if (job.offer_status === "sent") return "New offer";
  // offer_status === "accepted" — follow the job's own progress from here.
  switch (job.job_status) {
    case "accepted_by_supplier":
      return "Accepted — confirm to proceed";
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

function JobOfferRow({ job, hasInvoice }: { job: JobOfferView; hasInvoice: boolean }) {
  return (
    <Link
      href={`/supplier/dashboard/${job.job_id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 hover:bg-slate-50"
    >
      <div>
        <b>{job.region ?? "Region not set"}</b>
        <div className="text-xs text-slate-500">
          {job.pickup_date ?? "Date TBC"} {job.pickup_time ?? ""} · {job.passenger_count ?? "?"} passengers
        </div>
        {job.job_status === "completed" && hasInvoice && <div className="mt-1 text-xs font-bold text-emerald-600">Invoice submitted</div>}
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{statusLabel(job)}</span>
        <span className="text-xs font-bold text-primary-600">View Details →</span>
      </div>
    </Link>
  );
}

export function SupplierDashboard({
  jobs,
  invoices,
}: {
  jobs: JobOfferView[];
  invoices: JobSupplierInvoice[];
  supplierId: string;
}) {
  const [tab, setTab] = useState<Tab>("active");

  const invoicedJobIds = useMemo(() => new Set(invoices.map((inv) => inv.job_id)), [invoices]);

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
      <PageHead eyebrow="Supplier Portal" title="Your jobs" text="Jobs offered to you — open one to view details, then accept, confirm, complete and invoice." />
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
            <JobOfferRow key={job.offer_id} job={job} hasInvoice={invoicedJobIds.has(job.job_id)} />
          ))}
          {visible.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No jobs here.</p>}
        </div>
      </Panel>
    </div>
  );
}
