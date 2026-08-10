"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { createClient } from "@/lib/supabase/client";
import { recordCustomerPaymentAction } from "@/app/(staff)/quotes/actions";
import { amountDueNow } from "@/lib/quoteMoney";
import { formatDateTime } from "@/lib/formatDate";
import type { QuoteStatus, CustomerPaymentMethod } from "@/lib/supabase/database.types";

export interface PaymentRow {
  id: string;
  amount: number;
  method: CustomerPaymentMethod;
  paid_at: string;
  proof_storage_path: string | null;
}

export interface AcceptedQuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  decided_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  customers: { company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[] } | null;
  quote_versions: { selling_price: number; deposit_percentage: number | null } | null;
  customer_payments: PaymentRow[] | null;
}

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function CustomerPaymentsPage({
  quotes,
  proofUrls,
  currentUserId,
}: {
  quotes: AcceptedQuoteRow[];
  proofUrls: Record<string, string | null>;
  currentUserId: string;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"awaiting" | "paid">("awaiting");
  const [target, setTarget] = useState<AcceptedQuoteRow | null>(null);
  const [amount, setAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const awaiting = useMemo(() => quotes.filter((q) => q.status === "accepted" || q.status === "partially_paid"), [quotes]);
  const paid = useMemo(() => quotes.filter((q) => q.status === "paid"), [quotes]);
  const visible = tab === "awaiting" ? awaiting : paid;

  function balanceOf(q: AcceptedQuoteRow) {
    if (!q.quote_versions) return 0;
    const alreadyPaid = (q.customer_payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    return amountDueNow(q.quote_versions, alreadyPaid);
  }

  function open(q: AcceptedQuoteRow) {
    setTarget(q);
    setAmount(String(balanceOf(q)));
    setProofFile(null);
    setModalError(null);
  }

  function confirm() {
    if (!target) return;
    if (!proofFile) {
      setModalError("Attach proof of payment before recording it.");
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setModalError("Enter an amount greater than zero.");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const path = `${currentUserId}/${crypto.randomUUID()}-${proofFile.name}`;
      const { error: uploadError } = await supabase.storage.from("customer-payment-proofs").upload(path, proofFile);
      if (uploadError) {
        setModalError(uploadError.message);
        notify(uploadError.message);
        return;
      }

      const result = await recordCustomerPaymentAction(target.id, {
        amount: amountNum,
        currency: target.currency,
        proofStoragePath: path,
        proofFileName: proofFile.name,
      });
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify(
        result.status === "paid"
          ? "Marked as paid — invoice generated and job sent to Confirmed Booking"
          : "Payment recorded — balance still outstanding",
      );
      setTarget(null);
      router.refresh();
    });
  }

  const targetBalance = target ? balanceOf(target) : 0;

  return (
    <div>
      <PageHead
        eyebrow="Accounting"
        title="Customer Payments"
        text="Quotes the customer has accepted — record deposits, balances and full payments as bank transfers arrive."
      />
      <div className="mb-4 flex gap-2">
        {(["awaiting", "paid"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-xl px-3 py-2 text-sm font-bold " +
              (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
            }
          >
            {t === "awaiting" ? `Awaiting Payment (${awaiting.length})` : `Paid (${paid.length})`}
          </button>
        ))}
      </div>
      <Panel>
        <div className="space-y-3">
          {visible.map((q) => {
            const leg = q.enquiries?.enquiry_legs?.[0];
            const customer = q.customers;
            const balance = balanceOf(q);
            const paidSoFar = (q.customer_payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
            return (
              <div key={q.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-primary-600">{q.quote_number}</b>
                    {q.invoice_number && <span className="ml-2 text-xs text-slate-400">Inv {q.invoice_number}</span>}
                    <div className="text-sm font-semibold">{customer?.company_name || customer?.contact_name || "—"}</div>
                  </div>
                  <div className="text-right">
                    <span className="font-black">{money(q.quote_versions?.selling_price, q.currency)}</span>
                    {q.status === "partially_paid" && (
                      <div className="text-xs font-semibold text-amber-600">
                        {money(paidSoFar, q.currency)} paid · {money(balance, q.currency)} remaining
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                </div>
                {(q.customer_payments ?? []).length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {(q.customer_payments ?? []).map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="capitalize">
                          {p.method.replace("_", " ")} · {money(p.amount, q.currency)} · {formatDateTime(p.paid_at)}
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
                  {(q.status === "accepted" || q.status === "partially_paid") && (
                    <button
                      disabled={pending}
                      onClick={() => open(q)}
                      className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {balance < (q.quote_versions?.selling_price ?? 0) ? "Record Payment" : "Mark as Paid"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {tab === "awaiting" ? "No quotes awaiting payment." : "No paid quotes yet."}
            </p>
          )}
        </div>
      </Panel>

      {target && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setTarget(null)}
          title="Record a customer payment"
          description="Confirms a bank transfer has arrived — attach proof of payment to record it. If the amount covers the full outstanding balance, the quote is marked paid, an invoice is generated and the job is sent to dispatch."
          pending={pending}
          error={modalError}
          details={[
            { label: "Quote", value: target.quote_number },
            { label: "Customer", value: target.customers?.company_name || target.customers?.contact_name || "—" },
            { label: "Outstanding balance", value: money(targetBalance, target.currency) },
          ]}
          confirmLabel="Record payment"
          onConfirm={confirm}
        >
          <label className="block text-sm font-bold">
            Amount received
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="mt-3 block text-sm font-bold">
            Proof of payment (required)
            <input
              type="file"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-xs font-normal"
            />
          </label>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
