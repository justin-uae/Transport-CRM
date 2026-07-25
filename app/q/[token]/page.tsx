import { notFound } from "next/navigation";
import { Bus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuoteDecisionButtons } from "./QuoteDecisionButtons";

interface BrandSnapshot {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface VersionRow {
  vehicle_description: string | null;
  selling_price: number;
  deposit_options: number[];
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: BrandSnapshot;
}

interface LegRow {
  pickup_address: string;
  destination_address: string;
  pickup_date: string | null;
  pickup_time: string | null;
  passenger_count: number | null;
}

const DECIDABLE = new Set(["sent", "viewed"]);

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, customers(company_name, contact_name), enquiries(enquiry_legs(pickup_address, destination_address, pickup_date, pickup_time, passenger_count)), quote_versions!quotes_current_version_id_fkey(vehicle_description, selling_price, deposit_options, payment_methods, customer_notes, terms_snapshot, brand_snapshot)",
    )
    .eq("public_token", token)
    .single();

  if (!quote) notFound();

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
  const leg = (quote.enquiries as unknown as { enquiry_legs: LegRow[] } | null)?.enquiry_legs?.[0];
  const version = quote.quote_versions as unknown as VersionRow | null;
  const brand = version?.brand_snapshot;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: quote.currency, maximumFractionDigits: 0 }).format(amount);

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
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize">{status}</span>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-5 text-sm">
            <div className="flex justify-between border-b py-2">
              <span className="text-slate-500">Journey</span>
              <b>{leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}</b>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-slate-500">Date</span>
              <b>{leg?.pickup_date ?? "—"} {leg?.pickup_time ?? ""}</b>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-slate-500">Passengers</span>
              <b>{leg?.passenger_count ?? "—"}</b>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-slate-500">Vehicle</span>
              <b>{version?.vehicle_description ?? "—"}</b>
            </div>
            {quote.expiry_at && (
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Valid until</span>
                <b>{new Date(quote.expiry_at).toLocaleDateString()}</b>
              </div>
            )}
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Total</span>
              <b className="text-lg text-primary-600">{version ? money(version.selling_price) : "—"}</b>
            </div>
          </div>

          {version?.customer_notes && <p className="mt-4 text-sm text-slate-600">{version.customer_notes}</p>}
          {version?.terms_snapshot && <p className="mt-4 text-xs text-slate-400">{version.terms_snapshot}</p>}

          <div className="mt-6">
            {DECIDABLE.has(status) ? (
              <QuoteDecisionButtons token={token} />
            ) : status === "accepted" ? (
              <div className="rounded-2xl bg-emerald-50 p-5 text-center font-bold text-emerald-700">
                Thank you — this quote has been accepted. We'll be in touch shortly to confirm payment.
              </div>
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
