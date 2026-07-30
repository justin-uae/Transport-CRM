"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { recordSupplierPaymentAction } from "@/app/(staff)/accounting/supplier-payments/actions";
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
    supplier_payments: { amount: number; bank_reference: string | null; notes: string | null; paid_at: string }[];
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
}: {
  invoices: SupplierInvoiceRow[];
  invoiceUrls: Record<string, string | null>;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<SupplierInvoiceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const outstanding = invoices.filter((row) => row.jobs?.supplier_payment_status !== "paid");

  function open(row: SupplierInvoiceRow) {
    const balance = row.amount - paidSoFar(row);
    setTarget(row);
    setAmount(balance > 0 ? balance.toFixed(2) : "");
    setBankReference("");
    setNotes("");
    setModalError(null);
  }

  function close() {
    if (pending) return;
    setTarget(null);
  }

  const enteredAmount = Number(amount) || 0;
  const balance = target ? target.amount - paidSoFar(target) : 0;
  const remainingAfter = balance - enteredAmount;

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const result = await recordSupplierPaymentAction(target.job_id, {
        amount: enteredAmount,
        currency: target.currency,
        bankReference,
        notes,
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
      <Panel>
        <div className="space-y-3">
          {outstanding.map((row) => {
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
                <div className="mt-3 flex items-center gap-3">
                  {invoiceUrls[row.id] && (
                    <a href={invoiceUrls[row.id] ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View invoice file
                    </a>
                  )}
                  <button
                    onClick={() => open(row)}
                    className="ml-auto rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
                  >
                    Record Payment
                  </button>
                </div>
              </div>
            );
          })}
          {outstanding.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No supplier invoices awaiting payment.</p>
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
          confirmLabel="Record payment"
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
            {remainingAfter > 0 && enteredAmount > 0 && (
              <p className="text-xs font-semibold text-amber-600">
                This leaves a balance of {money(remainingAfter, target.currency)} — you can pay the rest later.
              </p>
            )}
          </div>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
