"use client";

import { useEffect, useState, useTransition } from "react";
import { choosePaymentMethodAction, createStripeCheckoutAction } from "./actions";

export interface BankAccountRow {
  profile_label: string | null;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
  bank_address: string | null;
  payment_notes: string | null;
  currency: string;
}

// Stripe and bank transfer are never both available on the same quote — the
// selling price threshold picks exactly one (see lib/quoteMoney.ts's
// paymentMethodsFor) — so this only ever renders one path, not a real
// either/or choice.
export function PaymentChooser({
  token,
  amountDueLabel,
  stripeAvailable,
  bankTransferAvailable,
  bankAccounts,
  reference,
}: {
  token: string;
  amountDueLabel: string;
  stripeAvailable: boolean;
  bankTransferAvailable: boolean;
  bankAccounts: BankAccountRow[];
  reference: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Best-effort record of which method the customer is being shown, for
  // staff visibility on the quote detail page — not needed for branching
  // here since that's fully determined by the props above.
  useEffect(() => {
    if (bankTransferAvailable) {
      choosePaymentMethodAction(token, "bank_transfer").catch(() => {});
    }
  }, [token, bankTransferAvailable]);

  function payOnline() {
    setError(null);
    startTransition(async () => {
      const result = await createStripeCheckoutAction(token);
      if (result.error || !result.url) {
        setError(result.error ?? "Could not start Stripe checkout.");
        return;
      }
      window.location.href = result.url;
    });
  }

  if (bankTransferAvailable) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-center font-bold text-emerald-700">Please complete payment by bank transfer to confirm your booking.</p>
        <div className="mt-4 space-y-4">
          {bankAccounts.length === 0 && (
            <div className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">
              No payment details are currently configured — please contact us to arrange payment.
            </div>
          )}
          {bankAccounts.map((account, i) => (
            <div key={i} className="rounded-xl bg-white p-4 text-sm">
              {account.profile_label && (
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">{account.profile_label}</div>
              )}
              <Row label="Account name" value={account.account_name} />
              <Row label="Bank" value={account.bank_name} />
              {account.iban && <Row label="IBAN" value={account.iban} />}
              {account.account_number && <Row label="Account number" value={account.account_number} />}
              {account.sort_code && <Row label="Sort code" value={account.sort_code} />}
              {account.swift_bic && <Row label="SWIFT / BIC" value={account.swift_bic} />}
              {account.bank_address && (
                <div className="border-b py-1.5 text-xs text-slate-500 last:border-0">Bank address: {account.bank_address}</div>
              )}
              {account.payment_notes && <p className="mt-2 text-xs text-slate-500">{account.payment_notes}</p>}
            </div>
          ))}
          <div className="flex justify-between rounded-xl bg-white p-4 text-sm">
            <span className="text-slate-500">Payment reference</span>
            <b>{reference}</b>
          </div>
          <div className="flex justify-between rounded-xl bg-white p-4 text-sm">
            <span className="text-slate-500">Amount due now</span>
            <b className="text-primary-600">{amountDueLabel}</b>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-emerald-700">
          Please use <b>{reference}</b> as your payment reference so we can match your transfer quickly.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-slate-600">
        Amount due now: <b className="text-primary-600">{amountDueLabel}</b>
      </p>
      {error && <p className="mb-3 text-center text-sm font-semibold text-red-600">{error}</p>}
      {stripeAvailable ? (
        <button
          onClick={payOnline}
          disabled={pending}
          className="w-full rounded-xl bg-primary-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {pending ? "Please wait…" : "Pay Online (Stripe)"}
        </button>
      ) : (
        <div className="rounded-2xl bg-amber-50 p-5 text-center font-bold text-amber-700">
          No payment method is currently configured for this quote — please contact us.
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <b className="text-right break-all">{value}</b>
    </div>
  );
}
