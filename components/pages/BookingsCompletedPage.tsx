import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { Pagination } from "@/components/ui/Pagination";
import { BookingTabs } from "@/components/pages/BookingTabs";

export interface CompletedBookingJob {
  id: string;
  status: string;
  region: string | null;
  completed_at: string | null;
  quotes: {
    quote_number: string;
    currency: string;
    customers: { company_name: string | null; contact_name: string } | null;
    quote_versions: { selling_price: number } | null;
  } | null;
  suppliers: { name: string } | null;
}

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function BookingsCompletedPage({
  jobs,
  page,
  pageSize,
  total,
}: {
  jobs: CompletedBookingJob[];
  page: number;
  pageSize: number;
  total: number;
}) {
  return (
    <div>
      <PageHead eyebrow="Bookings" title="Completed Booking" text="Jobs the supplier has marked done." />
      <BookingTabs active="completed" />
      <Panel>
        <div className="space-y-3">
          {jobs.map((job) => {
            const customer = job.quotes?.customers;
            return (
              <div key={job.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
                    <div className="text-xs text-slate-500">
                      {job.quotes?.quote_number} · {job.region ?? "No region"}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Completed</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>{job.suppliers ? `Supplier: ${job.suppliers.name}` : "—"}</span>
                  <span className="font-bold">{money(job.quotes?.quote_versions?.selling_price, job.quotes?.currency ?? "EUR")}</span>
                </div>
                {job.completed_at && (
                  <p className="mt-1 text-xs text-slate-400">Completed {new Date(job.completed_at).toLocaleDateString()}</p>
                )}
                <Link
                  href={`/dispatch/${job.id}`}
                  className="mt-3 inline-block rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                >
                  View job
                </Link>
              </div>
            );
          })}
          {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No completed bookings yet.</p>}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>
    </div>
  );
}
