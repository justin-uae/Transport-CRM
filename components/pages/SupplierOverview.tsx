import Link from "next/link";
import { Inbox, Truck, CalendarCheck2, Receipt } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { statusLabel, statusBadgeStyle } from "@/lib/supplierJobStatus";
import type { JobOfferView } from "@/lib/supabase/database.types";

export function SupplierOverview({
  newOffers,
  activeJobs,
  completedJobs,
  pendingInvoices,
  recentJobs,
}: {
  newOffers: number;
  activeJobs: number;
  completedJobs: number;
  pendingInvoices: number;
  recentJobs: JobOfferView[];
}) {
  return (
    <div>
      <PageHead
        eyebrow="Supplier Portal"
        title="Dashboard"
        text="Your jobs at a glance — open a card below to jump straight to that list."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/supplier/dashboard/new">
          <Kpi title="New offers" value={String(newOffers)} icon={Inbox} warn={newOffers > 0} />
        </Link>
        <Link href="/supplier/dashboard/active">
          <Kpi title="Active jobs" value={String(activeJobs)} icon={Truck} />
        </Link>
        <Link href="/supplier/dashboard/history">
          <Kpi title="Completed jobs" value={String(completedJobs)} icon={CalendarCheck2} />
        </Link>
        <Link href="/supplier/dashboard/history?status=completed">
          <Kpi title="Pending invoices" value={String(pendingInvoices)} icon={Receipt} warn={pendingInvoices > 0} />
        </Link>
      </div>

      <Panel>
        <h2 className="text-sm font-black">Recent activity</h2>
        <div className="mt-4 space-y-3">
          {recentJobs.map((job) => (
            <Link
              key={job.offer_id}
              href={`/supplier/dashboard/${job.job_id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 hover:bg-slate-50"
            >
              <div>
                <b>{job.region ?? "Region not set"}</b>
                <div className="text-xs text-slate-500">
                  {job.pickup_date ?? "Date TBC"} {job.pickup_time ?? ""} · {job.passenger_count ?? "?"} passengers
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeStyle(job)}`}>{statusLabel(job)}</span>
            </Link>
          ))}
          {recentJobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No jobs yet — new offers will show up here.</p>}
        </div>
      </Panel>
    </div>
  );
}
