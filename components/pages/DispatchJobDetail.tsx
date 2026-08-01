"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import {
  offerJobToSuppliersAction,
  withdrawAllOffersAction,
  attachSupplierInvoiceAction,
  transferSupplierInvoiceToAccountingAction,
} from "@/app/(staff)/dispatch/actions";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import type { JobOfferStatus, JobStatus, JobSupplierInvoice } from "@/lib/supabase/database.types";
import type { SupplierOption } from "@/components/pages/DispatchBoard";

export interface JobDetailRow {
  id: string;
  status: JobStatus;
  region: string | null;
  offered_at: string | null;
  responded_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  supplier_invoice_note: string | null;
  supplier_invoice_url: string | null;
  created_at: string;
  quotes: {
    quote_number: string;
    currency: string;
    customers: { company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
    enquiries: { enquiry_legs: JourneyLeg[] } | null;
    quote_versions: { selling_price: number } | null;
  } | null;
  suppliers: { id: string; name: string; region: string | null; phone: string | null; email: string | null } | null;
  job_offers: {
    id: string;
    status: JobOfferStatus;
    offered_at: string;
    responded_at: string | null;
    suppliers: { id: string; name: string; region: string | null } | null;
  }[];
}

const OFFER_STATUS_STYLE: Record<JobOfferStatus, string> = {
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
};

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function DispatchJobDetail({
  job,
  suppliers,
  invoice,
  invoiceUrl,
  canTransferInvoice,
  canDispatchJobs,
}: {
  job: JobDetailRow;
  suppliers: SupplierOption[];
  invoice: JobSupplierInvoice | null;
  invoiceUrl: string | null;
  canTransferInvoice: boolean;
  canDispatchJobs: boolean;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(() =>
    suppliers.filter((s) => s.region && job.region?.toLowerCase().includes(s.region.toLowerCase())).map((s) => s.id),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [note, setNote] = useState(job.supplier_invoice_note ?? "");
  const [url, setUrl] = useState(job.supplier_invoice_url ?? "");

  const legs = [...(job.quotes?.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
  const firstLeg = legs[0];
  const customer = job.quotes?.customers;
  const canOffer = canDispatchJobs && (job.status === "unassigned" || job.status === "rejected_by_supplier");
  const canWithdraw = canDispatchJobs && job.status === "offered";

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.region ?? "").toLowerCase().includes(q));
  }, [suppliers, search]);

  function toggleSupplier(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function offer() {
    startTransition(async () => {
      try {
        await offerJobToSuppliersAction(job.id, selected);
        notify(`Job offered to ${selected.length} supplier${selected.length === 1 ? "" : "s"}`);
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not offer this job.");
      }
    });
  }

  function withdraw() {
    startTransition(async () => {
      try {
        await withdrawAllOffersAction(job.id);
        notify("Offers withdrawn — job is back to unassigned");
        setWithdrawOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not withdraw the offers.");
      }
    });
  }

  function transfer() {
    startTransition(async () => {
      try {
        await transferSupplierInvoiceToAccountingAction(job.id);
        notify("Invoice forwarded to accounting");
        setTransferOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not forward this invoice.");
      }
    });
  }

  function saveInvoice() {
    startTransition(async () => {
      try {
        await attachSupplierInvoiceAction(job.id, note, url);
        notify("Invoice reference saved");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the invoice reference.");
      }
    });
  }

  const selectedNames = suppliers.filter((s) => selected.includes(s.id)).map((s) => s.name);

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title={job.quotes?.quote_number ?? "Job"}
        text={customer?.company_name || customer?.contact_name || undefined}
        action={
          <Link href="/dispatch" className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to Dispatch
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel>
            <SectionTitle title="Journey" sub={legs.length > 1 ? `${legs.length} legs` : "Pickup, destination and passenger details"} />
            <div className="mt-4">
              {legs.map((leg, i) => (
                <JourneyLegDetail key={leg.sequence} leg={leg} index={i} total={legs.length} />
              ))}
              {legs.length === 0 && <p className="text-sm text-slate-500">No journey details recorded.</p>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Value</dt>
                <dd className="mt-0.5 font-semibold">
                  {money(job.quotes?.quote_versions?.selling_price, job.quotes?.currency ?? "EUR")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Customer contact</dt>
                <dd className="mt-0.5 font-semibold">{customer?.phone || customer?.email || "—"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel>
            <SectionTitle title="Supplier offers" sub="Every supplier this job has been offered to" />
            {job.suppliers && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                Assigned to {job.suppliers.name}
                {job.suppliers.phone && ` · ${job.suppliers.phone}`}
              </div>
            )}
            <div className="mt-3 space-y-2">
              {job.job_offers.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
                  <div>
                    <b>{o.suppliers?.name ?? "Unknown supplier"}</b>
                    <div className="text-xs text-slate-400">{o.suppliers?.region ?? "No region"}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${OFFER_STATUS_STYLE[o.status]}`}>
                    {o.status}
                  </span>
                </div>
              ))}
              {job.job_offers.length === 0 && <p className="text-sm text-slate-500">No offers sent yet.</p>}
            </div>
            {canWithdraw && (
              <button
                disabled={pending}
                onClick={() => {
                  setModalError(null);
                  setWithdrawOpen(true);
                }}
                className="mt-4 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
              >
                Withdraw all offers
              </button>
            )}
          </Panel>

          {invoice && (
            <Panel>
              <SectionTitle title="Supplier's uploaded invoice" sub="Submitted by the supplier once they confirmed the job" />
              <div className="mt-3 flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
                <div>
                  <b>
                    {invoice.currency} {invoice.amount.toFixed(2)}
                  </b>
                  <div className="text-xs text-slate-400">{invoice.notes || "No notes"}</div>
                </div>
                {invoiceUrl ? (
                  <a href={invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                    View file
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">{invoice.file_name}</span>
                )}
              </div>
              {invoice.status === "forwarded_to_accounting" ? (
                <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  Forwarded to accounting
                </div>
              ) : canTransferInvoice ? (
                <button
                  disabled={pending}
                  onClick={() => {
                    setModalError(null);
                    setTransferOpen(true);
                  }}
                  className="mt-4 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  Transfer to Accountant
                </button>
              ) : null}
            </Panel>
          )}

          {job.status === "completed" && canDispatchJobs && (
            <Panel>
              <SectionTitle title="Manual payment reference" sub="Optional note/link recorded outside the supplier's own invoice upload" />
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Invoice note"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Invoice link (optional)"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                />
                <button
                  disabled={pending}
                  onClick={saveInvoice}
                  className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </Panel>
          )}
        </div>

        <div>
          {canOffer && (
            <Panel>
              <SectionTitle title="Offer to suppliers" sub="Search and select one or more approved suppliers" />
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search suppliers by name or region…"
                  className="w-full rounded-xl border bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {filteredSuppliers.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={() => toggleSupplier(s.id)}
                    />
                    <span className="flex-1">{s.name}</span>
                    {s.region && <span className="text-xs text-slate-400">{s.region}</span>}
                  </label>
                ))}
                {filteredSuppliers.length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-500">No matching suppliers.</p>
                )}
              </div>
              <button
                disabled={pending || selected.length === 0}
                onClick={() => {
                  setModalError(null);
                  setConfirmOpen(true);
                }}
                className="mt-4 w-full rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Offer to {selected.length} supplier{selected.length === 1 ? "" : "s"}
              </button>
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDetailModal
        open={confirmOpen}
        onClose={() => !pending && setConfirmOpen(false)}
        title={`Offer this job to ${selected.length} supplier${selected.length === 1 ? "" : "s"}?`}
        description="Whoever accepts first gets the job — the others' offers are automatically withdrawn."
        pending={pending}
        error={modalError}
        details={[
          { label: "Journey", value: firstLeg ? `${firstLeg.pickup_address} → ${firstLeg.destination_address}` : "—" },
          { label: "Date", value: firstLeg?.pickup_date ?? "—" },
          { label: "Suppliers", value: selectedNames.join(", ") || "—" },
        ]}
        confirmLabel="Send offers"
        onConfirm={offer}
      />

      <ConfirmDetailModal
        open={withdrawOpen}
        onClose={() => !pending && setWithdrawOpen(false)}
        title="Withdraw all outstanding offers?"
        description="This job goes back to unassigned so you can offer it to a different set of suppliers."
        pending={pending}
        error={modalError}
        destructive
        confirmLabel="Withdraw offers"
        onConfirm={withdraw}
      />

      {invoice && (
        <ConfirmDetailModal
          open={transferOpen}
          onClose={() => !pending && setTransferOpen(false)}
          title="Transfer this invoice to Accountant?"
          description="The accountant will see the invoice and job details and can then pay the supplier by bank transfer."
          pending={pending}
          error={modalError}
          details={[
            { label: "Supplier", value: job.suppliers?.name ?? "—" },
            { label: "Amount", value: `${invoice.currency} ${invoice.amount.toFixed(2)}` },
          ]}
          confirmLabel="Transfer to Accountant"
          onConfirm={transfer}
        />
      )}
    </div>
  );
}
