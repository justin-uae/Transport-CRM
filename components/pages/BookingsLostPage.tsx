import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { BookingTabs } from "@/components/pages/BookingTabs";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import type { QuoteStatus } from "@/lib/supabase/database.types";

export interface LostBookingQuote {
  id: string;
  quote_number: string;
  currency: string;
  status: QuoteStatus;
  decided_at: string | null;
  expiry_at: string | null;
  customers: { company_name: string | null; contact_name: string } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[] } | null;
  quote_versions: { selling_price: number } | null;
  quote_decisions: { decision: string; reason: string | null; free_text: string | null }[];
}

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function BookingsLostPage({ quotes }: { quotes: LostBookingQuote[] }) {
  return (
    <div>
      <PageHead eyebrow="Bookings" title="Lost Booking" text="Quotes the customer rejected, or that expired unanswered." />
      <BookingTabs active="lost" />
      <Panel>
        <div className="space-y-3">
          {quotes.map((q) => {
            const customer = q.customers;
            const leg = q.enquiries?.enquiry_legs?.[0];
            const decision = q.quote_decisions?.[0] ?? null;
            const isExpired = q.status === "expired";
            return (
              <div key={q.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
                    <div className="text-xs text-slate-500">{q.quote_number}</div>
                  </div>
                  <span
                    className={
                      "rounded-full px-2.5 py-1 text-xs font-bold " +
                      (isExpired ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700")
                    }
                  >
                    {isExpired ? "Expired" : "Rejected"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>
                    {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                    {leg?.pickup_date && <span className="text-slate-400"> · {formatDate(leg.pickup_date)}</span>}
                  </span>
                  <span className="font-bold">{money(q.quote_versions?.selling_price, q.currency)}</span>
                </div>
                {!isExpired && decision && (decision.reason || decision.free_text) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {decision.reason && <span className="capitalize">{decision.reason.replaceAll("_", " ")}</span>}
                    {decision.reason && decision.free_text && " — "}
                    {decision.free_text && `“${decision.free_text}”`}
                  </p>
                )}
                {isExpired && q.expiry_at && (
                  <p className="mt-2 text-xs text-slate-500">Expired {formatDateTime(q.expiry_at)}</p>
                )}
                <Link
                  href={`/quotes/${q.id}`}
                  className="mt-3 inline-block rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                >
                  View quote
                </Link>
              </div>
            );
          })}
          {quotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No lost bookings yet.</p>}
        </div>
      </Panel>
    </div>
  );
}
