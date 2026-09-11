import { notFound } from "next/navigation";
import { Bus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { amountDueNow } from "@/lib/quotePayments";
import { formatDateTime, formatDate } from "@/lib/formatDate";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import { QuoteDecisionButtons } from "./QuoteDecisionButtons";
import { PaymentChooser, type BankAccountRow } from "./PaymentChooser";

interface BrandSnapshot {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface LineItemRow {
  description: string;
  amount: number;
  category: string;
}

interface VersionRow {
  vehicle_description: string | null;
  selling_price: number;
  deposit_percentage: number | null;
  deposit_fixed_amount: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: BrandSnapshot;
  quote_line_items: LineItemRow[] | null;
}

interface MilestoneRow {
  sequence: number;
  label: string;
  amount: number;
  due_date: string | null;
}

const DECIDABLE = new Set(["sent", "viewed"]);
const AWAITING_PAYMENT = new Set(["accepted", "partially_paid"]);

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, brand_id, tenant_id, invoice_number, invoiced_at, payment_method_chosen, customers(company_name, contact_name), enquiries(enquiry_legs(sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(vehicle_description, selling_price, deposit_percentage, deposit_fixed_amount, payment_methods, customer_notes, terms_snapshot, brand_snapshot, quote_line_items(description, amount, category)), customer_payments(amount), quote_payment_milestones(sequence, label, amount, due_date)",
    )
    .eq("public_token", token)
    .single();

  if (!quote) notFound();

  // Bank details are tenant-wide payment profiles (0055_bank_details_and_terms.sql) —
  // every profile is shown on every quote, regardless of the quote's own currency.
  const { data: bankAccountsRaw } = await admin
    .from("bank_accounts")
    .select("profile_label, account_name, bank_name, account_number, iban, sort_code, swift_bic, bank_address, payment_notes, currency")
    .eq("tenant_id", quote.tenant_id)
    .order("sort_order");
  const bankAccounts: BankAccountRow[] = bankAccountsRaw ?? [];

  const { data: tenant } = await admin.from("tenants").select("terms_and_conditions").eq("id", quote.tenant_id).maybeSingle();

  const { data: brandRow } = await admin.from("brands").select("companies(legal_name, registered_address)").eq("id", quote.brand_id).single();
  const company = brandRow?.companies as unknown as { legal_name: string; registered_address: string | null } | null;

  let status = quote.status;
  if (status === "sent") {
    await admin
      .from("quotes")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", quote.id);
    await admin.from("quote_events").insert({ quote_id: quote.id, event: "viewed" });
    status = "viewed";
  }

  const customer = quote.customers as unknown as { company_name: string | null; contact_name: string } | null;
  const legs = [...((quote.enquiries as unknown as { enquiry_legs: JourneyLeg[] } | null)?.enquiry_legs ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const version = quote.quote_versions as unknown as VersionRow | null;
  const brand = version?.brand_snapshot;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: quote.currency, maximumFractionDigits: 2 }).format(amount);

  const amountPaid = ((quote.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const milestones = [...((quote.quote_payment_milestones as unknown as MilestoneRow[] | null) ?? [])].sort((a, b) => a.sequence - b.sequence);
  const amountDue = version ? amountDueNow(version, amountPaid, milestones) : 0;
  let milestoneCumulative = 0;

  return (
    <div className="grid min-h-screen place-items-center bg-appbg px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl text-white"
            style={{ backgroundColor: brand?.primary_color ?? "#f97316" }}
          >
            <Bus size={26} />
          </div>
          <div className="text-lg font-black text-slate-900">{brand?.name ?? "Your quote"}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[.18em] text-primary-500">Quote {quote.quote_number}</div>
              <h1 className="mt-1 text-2xl font-black">{customer?.company_name || customer?.contact_name}</h1>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize">{status.replaceAll("_", " ")}</span>
          </div>

          <div className="mt-4 border-t border-dashed pt-4 text-sm">
            <div className="text-xs font-bold uppercase text-slate-400">From</div>
            <div className="mt-1 font-bold">{company?.legal_name || brand?.name}</div>
            {company?.registered_address && <div className="whitespace-pre-line text-slate-500">{company.registered_address}</div>}
          </div>

          <div className="mt-6 space-y-3">
            {legs.map((leg, i) => (
              <JourneyLegDetail key={i} leg={leg} index={i} total={legs.length} />
            ))}
            <div className="space-y-3 rounded-2xl bg-slate-50 p-5 text-sm">
              {quote.expiry_at && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                  <span className="text-slate-500">Valid until</span>
                  <b>{formatDateTime(quote.expiry_at)}</b>
                </div>
              )}
              {version?.quote_line_items && version.quote_line_items.length > 0 && (
                <div className="space-y-1 border-b py-2">
                  {version.quote_line_items.map((li, i) => (
                    <div key={i} className="flex justify-between text-slate-500">
                      <span>{li.description}</span>
                      <span>{money(li.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Total</span>
                <b className="text-lg text-primary-600">{version ? money(version.selling_price) : "—"}</b>
              </div>
            </div>

            {milestones.length > 0 && (
              <div className="space-y-2 rounded-2xl border p-4 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment schedule</div>
                {milestones.map((m) => {
                  milestoneCumulative += m.amount;
                  const covered = milestoneCumulative <= amountPaid + 0.01;
                  return (
                    <div key={m.sequence} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-1.5 last:border-0">
                      <span className={covered ? "text-slate-400 line-through" : "text-slate-600"}>
                        {m.label}
                        {m.due_date ? ` · due ${formatDate(m.due_date)}` : ""}
                      </span>
                      <b className={covered ? "text-slate-400" : ""}>{money(m.amount)}</b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {version?.customer_notes && <p className="mt-4 text-sm text-slate-600">{version.customer_notes}</p>}
          {(version?.terms_snapshot?.trim() || tenant?.terms_and_conditions?.trim()) && (
            <p className="mt-4 whitespace-pre-line text-xs text-slate-400">
              {version?.terms_snapshot?.trim() || tenant?.terms_and_conditions}
            </p>
          )}

          <div className="mt-6">
            {DECIDABLE.has(status) ? (
              <QuoteDecisionButtons token={token} />
            ) : AWAITING_PAYMENT.has(status) && version ? (
              <>
                {status === "partially_paid" && (
                  <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-center text-sm">
                    <span className="font-bold text-amber-700">
                      Deposit received: {money(amountPaid)} of {money(version.selling_price)}
                    </span>
                    <div className="text-amber-600">Remaining balance: {money(amountDue)}</div>
                  </div>
                )}
                <PaymentChooser
                  token={token}
                  amountDueLabel={money(amountDue)}
                  stripeAvailable={version.payment_methods.stripe}
                  bankTransferAvailable={version.payment_methods.bank_transfer}
                  bankAccounts={bankAccounts}
                  reference={quote.quote_number}
                />
              </>
            ) : status === "paid" ? (
              <InvoiceView
                token={token}
                invoiceNumber={quote.invoice_number}
                invoicedAt={quote.invoiced_at}
                amount={version ? money(version.selling_price) : "—"}
              />
            ) : status === "rejected" ? (
              <div className="rounded-2xl bg-slate-100 p-5 text-center font-bold text-slate-600">
                This quote has been marked as rejected.
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 p-5 text-center font-bold text-amber-700">
                This quote is no longer available for a decision (status: {status}).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceView({
  token,
  invoiceNumber,
  invoicedAt,
  amount,
}: {
  token: string;
  invoiceNumber: string | null;
  invoicedAt: string | null;
  amount: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
      <p className="font-bold text-emerald-700">Payment received — thank you.</p>
      <div className="mx-auto mt-4 max-w-xs space-y-2 rounded-xl bg-white p-4 text-left text-sm">
        <div className="flex justify-between border-b py-1.5">
          <span className="text-slate-500">Invoice number</span>
          <b>{invoiceNumber ?? "—"}</b>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-1.5">
          <span className="text-slate-500">Date</span>
          <b>{invoicedAt ? formatDateTime(invoicedAt) : "—"}</b>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-slate-500">Amount paid</span>
          <b className="text-emerald-700">{amount}</b>
        </div>
      </div>
      <a
        href={`/q/${token}/invoice`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
      >
        Download Invoice
      </a>
    </div>
  );
}
