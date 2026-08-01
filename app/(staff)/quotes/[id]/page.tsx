import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { QuoteDetailActions } from "@/components/pages/QuoteDetailActions";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import type { QuoteStatus, QuoteEventType, QuoteDecisionType, CustomerPaymentMethod } from "@/lib/supabase/database.types";

interface VersionRow {
  id: string;
  version_number: number;
  vehicle_description: string | null;
  supplier_estimated_cost: number | null;
  selling_price: number;
  currency: string;
  deposit_percentage: number | null;
  customer_notes: string | null;
  terms_snapshot: string | null;
  created_at: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  method: CustomerPaymentMethod;
  paid_at: string;
}

interface QuoteDetailRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  public_token: string;
  created_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  decided_at: string | null;
  customers: { company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
  enquiries: { enquiry_legs: JourneyLeg[] } | null;
  quote_versions: VersionRow[];
  quote_events: { event: QuoteEventType; created_at: string }[];
  quote_decisions: { decision: QuoteDecisionType; reason: string | null; free_text: string | null; decided_at: string }[];
  customer_payments: PaymentRow[];
}

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-50 text-blue-700",
  viewed: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  partially_paid: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  converted: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
};

const EVENT_LABEL: Record<QuoteEventType, string> = {
  sent: "Quote sent to customer",
  viewed: "Customer viewed the quote",
  accepted: "Customer accepted the quote",
  rejected: "Customer rejected the quote",
  expired: "Quote expired",
  cancelled: "Quote cancelled",
  partially_paid: "Deposit/partial payment received",
  paid: "Paid in full",
};

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const { data: quoteRaw, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, invoice_number, invoiced_at, public_token, created_at, sent_at, viewed_at, decided_at, customers(company_name, contact_name, phone, email), enquiries(enquiry_legs(sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), quote_versions!quote_versions_quote_id_fkey(id, version_number, vehicle_description, supplier_estimated_cost, selling_price, currency, deposit_percentage, customer_notes, terms_snapshot, created_at), quote_events(event, created_at), quote_decisions(decision, reason, free_text, decided_at), customer_payments(id, amount, method, paid_at)",
    )
    .eq("id", id)
    .single();

  if (quoteError) console.error("quote detail fetch failed:", quoteError.message);
  if (!quoteRaw) notFound();
  const quote = quoteRaw as unknown as QuoteDetailRow;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, suppliers(name)")
    .eq("quote_id", id)
    .maybeSingle();

  const customer = quote.customers;
  const legs = [...(quote.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
  const versions = [...(quote.quote_versions ?? [])].sort((a, b) => b.version_number - a.version_number);
  const currentVersion = versions[0] ?? null;
  const events = [...(quote.quote_events ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const decision = quote.quote_decisions?.[0] ?? null;
  const jobRow = job as unknown as { id: string; status: string; suppliers: { name: string } | null } | null;
  const payments = [...(quote.customer_payments ?? [])].sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());
  const paidSoFar = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceRemaining = Math.max(0, (currentVersion?.selling_price ?? 0) - paidSoFar);

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title={quote.quote_number}
        text={customer?.company_name || customer?.contact_name || undefined}
        action={
          <Link href="/quotes" className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to Quotes
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel>
            <div className="flex items-start justify-between">
              <SectionTitle title="Journey" sub={legs.length > 1 ? `${legs.length} legs` : "Pickup, destination and passenger details"} />
              <span className={"rounded-full px-2.5 py-1 text-xs font-bold capitalize " + STATUS_STYLE[quote.status]}>
                {quote.status}
              </span>
            </div>
            <div className="mt-4">
              {legs.map((leg, i) => (
                <JourneyLegDetail key={leg.sequence} leg={leg} index={i} total={legs.length} />
              ))}
              {legs.length === 0 && <p className="text-sm text-slate-500">No journey details recorded.</p>}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Pricing" sub="Current version details" />
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Vehicle</dt>
                <dd className="mt-0.5 font-semibold">{currentVersion?.vehicle_description ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Valid until</dt>
                <dd className="mt-0.5 font-semibold">{quote.expiry_at ? new Date(quote.expiry_at).toLocaleDateString() : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Supplier cost (est.)</dt>
                <dd className="mt-0.5 font-semibold">{money(currentVersion?.supplier_estimated_cost, quote.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Selling price</dt>
                <dd className="mt-0.5 text-base font-black text-primary-600">{money(currentVersion?.selling_price, quote.currency)}</dd>
              </div>
            </dl>
            {currentVersion?.customer_notes && <p className="mt-4 text-sm text-slate-600">{currentVersion.customer_notes}</p>}
          </Panel>

          <Panel>
            <SectionTitle title="Customer" />
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Name</dt>
                <dd className="mt-0.5 font-semibold">{customer?.company_name || customer?.contact_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Contact</dt>
                <dd className="mt-0.5 font-semibold">{customer?.phone || customer?.email || "—"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel>
            <SectionTitle title="Timeline" sub="Every recorded event on this quote" />
            <ol className="mt-4 space-y-3">
              {events.map((e, i) => (
                <li key={i} className="flex items-center justify-between border-b pb-3 text-sm last:border-0">
                  <span className="font-semibold">{EVENT_LABEL[e.event]}</span>
                  <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
                </li>
              ))}
              {events.length === 0 && <p className="text-sm text-slate-500">No events recorded yet.</p>}
            </ol>
            {decision && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="font-bold capitalize">Customer {decision.decision}</div>
                {decision.reason && <p className="mt-1 text-slate-600">Reason: {decision.reason}</p>}
                {decision.free_text && <p className="mt-1 text-slate-600">&ldquo;{decision.free_text}&rdquo;</p>}
                <p className="mt-1 text-xs text-slate-400">{new Date(decision.decided_at).toLocaleString()}</p>
              </div>
            )}
          </Panel>

          {versions.length > 1 && (
            <Panel>
              <SectionTitle title="Version history" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="pb-2">Version</th>
                      <th className="pb-2">Selling price</th>
                      <th className="pb-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className="border-t">
                        <td className="whitespace-nowrap py-2 font-bold">v{v.version_number}</td>
                        <td className="whitespace-nowrap py-2">{money(v.selling_price, v.currency)}</td>
                        <td className="whitespace-nowrap py-2 text-slate-500">{new Date(v.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Invoice" />
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between border-b py-1.5">
                <span className="text-slate-500">Invoice number</span>
                <b>{quote.invoice_number ?? "—"}</b>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Invoiced</span>
                <b>{quote.invoiced_at ? new Date(quote.invoiced_at).toLocaleDateString() : "—"}</b>
              </div>
            </dl>
            <div className="mt-4">
              <QuoteDetailActions
                quote={{
                  id: quote.id,
                  quote_number: quote.quote_number,
                  status: quote.status,
                  currency: quote.currency,
                  public_token: quote.public_token,
                  invoice_number: quote.invoice_number,
                  customerLabel: customer?.company_name || customer?.contact_name || "—",
                  sellingPrice: currentVersion?.selling_price ?? null,
                }}
              />
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              title="Payments"
              sub={
                currentVersion?.deposit_percentage
                  ? `${currentVersion.deposit_percentage}% deposit plan`
                  : "Full payment plan"
              }
            />
            <div className="mt-4 space-y-2 text-sm">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between border-b py-1.5 last:border-0">
                  <span className="capitalize text-slate-500">
                    {p.method.replace("_", " ")} · {new Date(p.paid_at).toLocaleDateString()}
                  </span>
                  <b>{money(p.amount, quote.currency)}</b>
                </div>
              ))}
              {payments.length === 0 && <p className="text-sm text-slate-500">No payments recorded yet.</p>}
              {payments.length > 0 && (
                <div className="flex justify-between pt-1.5 text-sm font-bold">
                  <span>Balance remaining</span>
                  <span className="text-primary-600">{money(balanceRemaining, quote.currency)}</span>
                </div>
              )}
            </div>
          </Panel>

          {jobRow && (
            <Panel>
              <SectionTitle title="Dispatch" />
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b py-1.5">
                  <span className="text-slate-500">Job status</span>
                  <b className="capitalize">{jobRow.status.replaceAll("_", " ")}</b>
                </div>
                {jobRow.suppliers && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Supplier</span>
                    <b>{jobRow.suppliers.name}</b>
                  </div>
                )}
              </div>
              <Link
                href={`/dispatch/${jobRow.id}`}
                className="mt-4 block rounded-xl border border-primary-300 px-4 py-2.5 text-center text-sm font-bold text-primary-700"
              >
                View in Dispatch
              </Link>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
