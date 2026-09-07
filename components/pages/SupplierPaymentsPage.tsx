"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatDate } from "@/lib/formatDate";
import { recordSupplierPaymentAction } from "@/app/(staff)/accounting/supplier-payments/actions";
import { downloadCsv } from "@/lib/exportCsv";
import type { SupplierPaymentStatus } from "@/lib/supabase/database.types";

export interface SupplierInvoiceRow {
  id: string;
  job_id: string;
  amount: number;
  currency: string;
  notes: string | null;
  file_name: string;
  storage_path: string;
  forwarded_at: string | null;
  jobs: {
    id: string;
    status: string;
    supplier_payment_status: SupplierPaymentStatus;
    region: string | null;
    suppliers: { id: string; name: string; phone: string | null; email: string | null } | null;
    quotes: { quote_number: string; customers: { company_name: string | null; contact_name: string } | null } | null;
    supplier_payments: {
      id: string;
      amount: number;
      bank_reference: string | null;
      notes: string | null;
      paid_at: string;
      proof_storage_path: string | null;
    }[];
  } | null;
}

const STATUS_STYLE: Record<SupplierPaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-600",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function paidSoFar(row: SupplierInvoiceRow) {
  return (row.jobs?.supplier_payments ?? []).reduce((sum, p) => sum + p.amount, 0);
}

export function SupplierPaymentsPage({
  invoices,
  invoiceUrls,
  proofUrls,
  currentUserId,
}: {
  invoices: SupplierInvoiceRow[];
  invoiceUrls: Record<string, string | null>;
  proofUrls: Record<string, string | null>;
  currentUserId: string;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"outstanding" | "paid">("outstanding");
  const [target, setTarget] = useState<SupplierInvoiceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const outstanding = invoices.filter((row) => row.jobs?.supplier_payment_status !== "paid");
  const paidHistory = invoices.filter((row) => row.jobs?.supplier_payment_status === "paid");

  const supplierOptions = useMemo(() => {
    const names = new Set(invoices.map((row) => row.jobs?.suppliers?.name).filter((n): n is string => !!n));
    return [...names].sort();
  }, [invoices]);

  /** Latest payment date on the invoice (Paid History rows always have at
      least one) — used for both display and the date-range filter there. */
  function latestPaymentDate(row: SupplierInvoiceRow): string | null {
    const dates = (row.jobs?.supplier_payments ?? []).map((p) => p.paid_at).sort();
    return dates.length > 0 ? dates[dates.length - 1]! : null;
  }

  const filtered = useMemo(() => {
    const base = tab === "outstanding" ? outstanding : paidHistory;
    const q = search.trim().toLowerCase();
    return base.filter((row) => {
      if (supplierFilter && row.jobs?.suppliers?.name !== supplierFilter) return false;
      if (q) {
        const haystack = [
          row.jobs?.suppliers?.name,
          row.jobs?.quotes?.quote_number,
          row.jobs?.quotes?.customers?.company_name,
          row.jobs?.quotes?.customers?.contact_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const relevantDate = tab === "outstanding" ? row.forwarded_at : latestPaymentDate(row);
      if (dateFrom && (!relevantDate || relevantDate < dateFrom)) return false;
      if (dateTo && (!relevantDate || relevantDate > `${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [tab, outstanding, paidHistory, search, supplierFilter, dateFrom, dateTo]);

  const visible = filtered;

  function exportVisible() {
    downloadCsv(`supplier-payments-${tab}`, visible, [
      { header: "Supplier", value: (row) => row.jobs?.suppliers?.name },
      { header: "Quote number", value: (row) => row.jobs?.quotes?.quote_number },
      { header: "Customer", value: (row) => row.jobs?.quotes?.customers?.company_name || row.jobs?.quotes?.customers?.contact_name },
      { header: "Currency", value: (row) => row.currency },
      { header: "Invoice amount", value: (row) => row.amount },
      { header: "Paid so far", value: (row) => paidSoFar(row) },
      { header: "Balance", value: (row) => row.amount - paidSoFar(row) },
      { header: "Status", value: (row) => row.jobs?.supplier_payment_status ?? "unpaid" },
      { header: "Forwarded", value: (row) => (row.forwarded_at ? formatDate(row.forwarded_at) : "") },
      { header: "Latest payment date", value: (row) => { const d = latestPaymentDate(row); return d ? formatDate(d) : ""; } },
    ]);
  }

  function open(row: SupplierInvoiceRow) {
    const balance = row.amount - paidSoFar(row);
    setTarget(row);
    setAmount(balance > 0 ? balance.toFixed(2) : "");
    setBankReference("");
    setNotes("");
    setProofFile(null);
    setModalError(null);
  }

  function close() {
    if (pending) return;
    setTarget(null);
  }

  const enteredAmount = Number(amount) || 0;
  const balance = target ? target.amount - paidSoFar(target) : 0;
  const remainingAfter = balance - enteredAmount;
  const willFullySettle = enteredAmount > 0 && remainingAfter <= 0;

  function confirm() {
    if (!target) return;
    if (willFullySettle && !proofFile) {
      setModalError("Attach proof of payment before marking this supplier as fully paid.");
      return;
    }
    startTransition(async () => {
      let proofStoragePath: string | null = null;
      let proofFileName: string | null = null;

      if (proofFile) {
        const supabase = createClient();
        const path = `${currentUserId}/${crypto.randomUUID()}-${proofFile.name}`;
        const { error: uploadError } = await supabase.storage.from("supplier-payment-proofs").upload(path, proofFile);
        if (uploadError) {
          setModalError(uploadError.message);
          notify(uploadError.message);
          return;
        }
        proofStoragePath = path;
        proofFileName = proofFile.name;
      }

      const result = await recordSupplierPaymentAction(target.job_id, {
        amount: enteredAmount,
        currency: target.currency,
        bankReference,
        notes,
        proofStoragePath,
        proofFileName,
      });
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify(remainingAfter > 0 ? "Partial payment recorded" : "Supplier marked as paid in full");
      setTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Accounting"
        title="Supplier Payments"
        text="Invoices forwarded from Dispatch — pay the supplier by bank transfer outside the system, then record it here (partial payments supported)."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["outstanding", "paid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-xl px-3 py-2 text-sm font-bold " +
                (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
              }
            >
              {t === "outstanding" ? `Outstanding (${outstanding.length})` : `Paid History (${paidHistory.length})`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportVisible}
          disabled={visible.length === 0}
          className="rounded-xl border px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supplier, quote, customer…"
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        />
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        >
          <option value="">All suppliers</option>
          {supplierOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label={tab === "outstanding" ? "Forwarded from" : "Paid from"}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label={tab === "outstanding" ? "Forwarded to" : "Paid to"}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        />
      </div>
      <Panel>
        <div className="space-y-3">
          {visible.map((row) => {
            const paid = paidSoFar(row);
            const bal = row.amount - paid;
            const customer = row.jobs?.quotes?.customers;
            const status = row.jobs?.supplier_payment_status ?? "unpaid";
            return (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{row.jobs?.suppliers?.name ?? "Unknown supplier"}</b>
                    <div className="text-xs text-slate-500">
                      {row.jobs?.quotes?.quote_number} · {customer?.company_name || customer?.contact_name || "—"}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[status]}`}>
                    {status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">Invoice</div>
                    <b>{money(row.amount, row.currency)}</b>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">Paid so far</div>
                    <b>{money(paid, row.currency)}</b>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">Balance</div>
                    <b className="text-primary-600">{money(bal, row.currency)}</b>
                  </div>
                </div>
                {(row.jobs?.supplier_payments?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-500">
                    {row.jobs!.supplier_payments.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span>
                          {money(p.amount, row.currency)} · {formatDateTime(p.paid_at)}
                          {p.bank_reference && ` · ${p.bank_reference}`}
                        </span>
                        {proofUrls[p.id] && (
                          <a href={proofUrls[p.id] ?? undefined} target="_blank" rel="noreferrer" className="font-bold text-primary-600">
                            View proof
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  {invoiceUrls[row.id] && (
                    <a href={invoiceUrls[row.id] ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View invoice file
                    </a>
                  )}
                  {tab === "outstanding" && (
                    <button
                      onClick={() => open(row)}
                      className="ml-auto rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
                    >
                      Record Payment
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {tab === "outstanding" ? "No supplier invoices awaiting payment." : "No supplier payments recorded yet."}
            </p>
          )}
        </div>
      </Panel>

      {target && (
        <ConfirmDetailModal
          open
          onClose={close}
          title="Record a payment to this supplier?"
          description="This confirms you've already sent the bank transfer outside the system — this just logs it."
          pending={pending}
          error={modalError}
          details={[
            { label: "Supplier", value: target.jobs?.suppliers?.name ?? "—" },
            { label: "Invoice total", value: money(target.amount, target.currency) },
            { label: "Balance before", value: money(balance, target.currency) },
            { label: "Balance after this payment", value: money(Math.max(remainingAfter, 0), target.currency) },
          ]}
          confirmLabel={willFullySettle ? "Mark supplier as paid" : "Record partial payment"}
          onConfirm={confirm}
        >
          <div className="space-y-2">
            <label className="block text-sm font-bold">
              Amount ({target.currency})
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Bank reference
              <input
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="Transfer reference / ID"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Notes (optional)
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Proof of payment{willFullySettle ? " (required)" : " (optional)"}
              <input
                type="file"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-xs font-normal"
              />
            </label>
            {remainingAfter > 0 && enteredAmount > 0 && (
              <p className="text-xs font-semibold text-amber-600">
                This leaves a balance of {money(remainingAfter, target.currency)} — you can pay the rest later.
              </p>
            )}
            {willFullySettle && (
              <p className="text-xs font-semibold text-emerald-600">
                This settles the invoice in full — attach proof of payment to mark the supplier as paid.
              </p>
            )}
          </div>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
