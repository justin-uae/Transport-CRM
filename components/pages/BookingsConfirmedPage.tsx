import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { BookingTabs } from "@/components/pages/BookingTabs";
import type { JobStatus } from "@/lib/supabase/database.types";

type CustomerRef = { company_name: string | null; contact_name: string } | null;
type LegsRef = { enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[] } | null;
type VersionRef = { selling_price: number } | null;

export interface ConfirmedBookingJob {
  id: string;
  status: JobStatus;
  region: string | null;
  created_at: string;
  quotes: {
    quote_number: string;
    currency: string;
    customers: CustomerRef;
    enquiries: LegsRef;
    quote_versions: VersionRef;
  } | null;
  suppliers: { name: string } | null;
}

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  unassigned: "Awaiting supplier assignment",
  offered: "Offered to suppliers",
  accepted_by_supplier: "Accepted by supplier",
  rejected_by_supplier: "Rejected by supplier",
  confirmed: "Confirmed with supplier",
  completed: "Completed",
  cancelled: "Cancelled",
};

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeySummary(legs: LegsRef) {
  const leg = legs?.enquiry_legs?.[0];
  if (!leg) return "—";
  return `${leg.pickup_address} → ${leg.destination_address}`;
}

export function BookingsConfirmedPage({ jobs }: { jobs: ConfirmedBookingJob[] }) {
  return (
    <div>
      <PageHead
        eyebrow="Bookings"
        title="Confirmed Booking"
        text="Quotes marked as paid, through to job completion by the supplier."
      />
      <BookingTabs active="confirmed" />
      <Panel>
        <div className="space-y-3">
          {jobs.map((job) => {
            const customer = job.quotes?.customers;
            const leg = job.quotes?.enquiries?.enquiry_legs?.[0];
            return (
              <div key={job.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
                    <div className="text-xs text-slate-500">
                      {job.quotes?.quote_number} · {job.region ?? "No region"}
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                    {JOB_STATUS_LABEL[job.status]}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>
                    {journeySummary(job.quotes?.enquiries ?? null)}
                    {leg?.pickup_date && <span className="text-slate-400"> · {leg.pickup_date}</span>}
                  </span>
                  <span className="font-bold">{money(job.quotes?.quote_versions?.selling_price, job.quotes?.currency ?? "EUR")}</span>
                </div>
                {job.suppliers && <p className="mt-1 text-xs text-slate-500">Assigned to {job.suppliers.name}</p>}
                <Link
                  href={`/dispatch/${job.id}`}
                  className="mt-3 inline-block rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                >
                  View job
                </Link>
              </div>
            );
          })}
          {jobs.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No bookings in progress — they appear here once the customer's payment is confirmed.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
