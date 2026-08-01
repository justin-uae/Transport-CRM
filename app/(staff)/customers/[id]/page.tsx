import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText, MapPin } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EnquiryStatus, QuoteStatus } from "@/lib/supabase/database.types";

const ENQUIRY_STATUS_STYLE: Record<EnquiryStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-50 text-blue-700",
  quoting: "bg-blue-50 text-blue-700",
  awaiting_customer: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  converted_to_booking: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
};

const QUOTE_STATUS_STYLE: Record<QuoteStatus, string> = {
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

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

interface EnquiryRow {
  id: string;
  status: EnquiryStatus;
  created_at: string;
  enquiry_legs: { pickup_address: string; destination_address: string }[];
}

interface QuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  created_at: string;
  quote_versions: { selling_price: number } | null;
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const [{ data: customer }, { data: enquiries }, { data: quotes }] = await Promise.all([
    supabase.from("customers").select("*, profiles:account_manager_id(full_name)").eq("id", id).single(),
    supabase
      .from("enquiries")
      .select("id, status, created_at, enquiry_legs(pickup_address, destination_address)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotes")
      .select("id, quote_number, status, currency, created_at, quote_versions!quotes_current_version_id_fkey(selling_price)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!customer) notFound();

  const accountManager = (customer.profiles as unknown as { full_name: string } | null)?.full_name ?? null;
  const enquiryRows = (enquiries ?? []) as unknown as EnquiryRow[];
  const quoteRows = (quotes ?? []) as unknown as QuoteRow[];

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title={customer.company_name || customer.contact_name}
        text={customer.company_name ? customer.contact_name : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle title="Contact details" sub="How this customer was reached and billed" />
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Email" value={customer.email} />
            <Row label="Phone" value={customer.phone} />
            <Row label="Mobile" value={customer.mobile} />
            <Row label="WhatsApp" value={customer.whatsapp} />
            <Row label="Country" value={customer.country} />
            <Row label="Preferred language" value={customer.preferred_language} />
            <Row label="VAT number" value={customer.vat_number} />
            <Row label="Account manager" value={accountManager} />
            {customer.billing_address && (
              <div className="border-t pt-2">
                <div className="text-slate-500">Billing address</div>
                <p className="mt-1">{customer.billing_address}</p>
              </div>
            )}
            {customer.notes && (
              <div className="border-t pt-2">
                <div className="text-slate-500">Internal notes</div>
                <p className="mt-1">{customer.notes}</p>
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Enquiries" sub={`${enquiryRows.length} on record`} />
            <div className="mt-4 space-y-2">
              {enquiryRows.map((e) => {
                const leg = e.enquiry_legs?.[0];
                return (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                    <MapPin size={16} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">
                        {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "No journey recorded"}
                      </div>
                      <div className="text-xs text-slate-500">{new Date(e.created_at).toLocaleDateString()}</div>
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold capitalize ${ENQUIRY_STATUS_STYLE[e.status]}`}
                    >
                      {e.status.replaceAll("_", " ")}
                    </span>
                  </div>
                );
              })}
              {enquiryRows.length === 0 && <p className="text-sm text-slate-400">No enquiries yet.</p>}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Quotes" sub={`${quoteRows.length} on record`} />
            <div className="mt-4 space-y-2">
              {quoteRows.map((q) => (
                <Link
                  key={q.id}
                  href={`/quotes/${q.id}`}
                  className="flex items-center gap-3 rounded-xl border p-3 text-sm hover:bg-slate-50"
                >
                  <FileText size={16} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{q.quote_number}</div>
                    <div className="text-xs text-slate-500">
                      {money(q.quote_versions?.selling_price, q.currency)} · {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold capitalize ${QUOTE_STATUS_STYLE[q.status]}`}
                  >
                    {q.status}
                  </span>
                </Link>
              ))}
              {quoteRows.length === 0 && <p className="text-sm text-slate-400">No quotes yet.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="truncate whitespace-nowrap text-right font-semibold">{value ?? "—"}</span>
    </div>
  );
}
