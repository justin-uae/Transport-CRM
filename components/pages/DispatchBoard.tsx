"use client";

import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { Pagination } from "@/components/ui/Pagination";
import { PageGuide } from "@/components/ui/PageGuide";
import { DispatchDiagram } from "@/components/ui/guide-diagrams/DispatchDiagram";
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
  pending_reapproval: "bg-orange-50 text-orange-700",
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
        action={
          <PageGuide
            title="Dispatch"
            subtitle="Turn a paid booking into a job offer your suppliers can accept."
            screenshot={<DispatchDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "A job appears here the moment a quote is marked as paid on Customer Payments. Dispatch is where you hand that job to one or more approved suppliers.",
                ],
              },
              {
                heading: "Splitting a job",
                body: [
                  "A booking with multiple legs (e.g. airport pickup plus a separate return) doesn't have to go to one supplier — open the job to allocate each leg and offer them to different suppliers if that gets a better price or availability.",
                ],
              },
              {
                heading: "Job status flow",
                bullets: true,
                body: [
                  "Unassigned — no supplier offered yet.",
                  "Offered — sent to one or more suppliers, awaiting their response.",
                  "Accepted by supplier — a supplier has confirmed they'll run it.",
                  "Confirmed — locked in; the job later moves to Completed once the supplier marks it done.",
                  "Rejected by supplier — that offer was turned down; re-offer to another supplier from the job page.",
                ],
              },
              {
                heading: "Where it goes next",
                body: [
                  "Once the supplier marks a job done, it moves to Completed Booking. If it never gets past unassigned or gets rejected everywhere, it stays visible here until you act on it — nothing disappears on its own.",
                ],
              },
              {
                heading: "Editing a job after it's dispatched",
                body: [
                  "Open a job and use Edit Booking (in the Journey panel) to change pickup, destination, date, time, passengers or luggage — even once a supplier has accepted or confirmed. A reason is required, you can charge/credit the customer and/or adjust the supplier's payout at the same time, and it's logged to the Edit history panel on the same page. It closes off only once the job is marked Completed.",
                  "If the supplier had already accepted or confirmed, editing the journey or their payout pulls the allocation back to Awaiting supplier re-approval — they have to explicitly approve or reject the change on their own dashboard before anything proceeds. Approve and it carries on exactly as before; reject and the job comes straight back here as Rejected by supplier, ready to re-offer to someone else — nothing else on your end changes.",
                ],
              },
            ]}
          />
        }
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
