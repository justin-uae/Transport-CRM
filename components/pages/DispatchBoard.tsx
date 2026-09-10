"use client";

import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { Pagination } from "@/components/ui/Pagination";
import type { JobStatus } from "@/lib/supabase/database.types";

export interface JobRow {
  id: string;
  status: JobStatus;
  region: string | null;
  quotes: { quote_number: string; customers: { company_name: string | null; contact_name: string } | null } | null;
  job_allocations: { id: string; status: JobStatus; suppliers: { name: string } | null }[];
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

function allocationSummary(job: JobRow) {
  const live = job.job_allocations.filter((a) => a.status !== "cancelled");
  if (live.length === 0) return "Not yet allocated";
  if (live.length === 1) {
    const a = live[0]!;
    return a.suppliers ? `Assigned to ${a.suppliers.name}` : "1 allocation, not yet assigned";
  }
  const confirmedOrLater = live.filter((a) => a.status === "confirmed" || a.status === "completed").length;
  return `${live.length} allocations · ${confirmedOrLater} confirmed`;
}

function JobCard({ job }: { job: JobRow }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{job.quotes?.customers?.company_name || job.quotes?.customers?.contact_name || "Customer"}</b>
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

      <p className="mt-2 text-xs text-slate-500">{allocationSummary(job)}</p>
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
        text="Assign paid bookings to one or more approved suppliers — split multi-leg bookings across suppliers as needed. Open a job to allocate legs and offer them."
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
