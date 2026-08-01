"use client";

import { useState, useTransition } from "react";
import { choosePaymentMethodAction, createStripeCheckoutAction } from "./actions";

export interface BankAccountRow {
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
}

export function PaymentChooser({
  token,
  amountDueLabel,
  stripeAvailable,
  initialMethod,
  bankAccount,
  reference,
}: {
  token: string;
  amountDueLabel: string;
  stripeAvailable: boolean;
  initialMethod: "stripe" | "bank_transfer" | null;
  bankAccount: BankAccountRow;
  reference: string;
}) {
  const [method, setMethod] = useState(initialMethod);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function chooseBankTransfer() {
    setError(null);
    startTransition(async () => {
      const result = await choosePaymentMethodAction(token, "bank_transfer");
      if (result.error) {
        setError(result.error);
        return;
      }
      setMethod("bank_transfer");
    });
  }

  function changeMethod() {
    setError(null);
    startTransition(async () => {
      await choosePaymentMethodAction(token, null);
      setMethod(null);
    });
  }

  if (method === "bank_transfer") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-center font-bold text-emerald-700">Please complete payment by bank transfer to confirm your booking.</p>
        <div className="mt-4 space-y-2 rounded-xl bg-white p-4 text-sm">
          <Row label="Account name" value={bankAccount.account_name} />
          <Row label="Bank" value={bankAccount.bank_name} />
          {bankAccount.iban && <Row label="IBAN" value={bankAccount.iban} />}
          {bankAccount.account_number && <Row label="Account number" value={bankAccount.account_number} />}
          {bankAccount.sort_code && <Row label="Sort code" value={bankAccount.sort_code} />}
          {bankAccount.swift_bic && <Row label="SWIFT / BIC" value={bankAccount.swift_bic} />}
          <Row label="Payment reference" value={reference} />
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Amount due now</span>
            <b className="text-primary-600">{amountDueLabel}</b>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-emerald-700">
          Please use <b>{reference}</b> as your payment reference so we can match your transfer quickly.
        </p>
        {stripeAvailable && (
          <button onClick={changeMethod} disabled={pending} className="mx-auto mt-4 block text-xs font-bold text-emerald-700 underline disabled:opacity-60">
            Pay online instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-slate-600">
        Amount due now: <b className="text-primary-600">{amountDueLabel}</b>
      </p>
      {error && <p className="mb-3 text-center text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        {stripeAvailable && (
          <button
            onClick={payOnline}
            disabled={pending}
            className="flex-1 rounded-xl bg-primary-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {pending ? "Please wait…" : "Pay Online (Stripe)"}
          </button>
        )}
        <button
          onClick={chooseBankTransfer}
          disabled={pending}
          className="flex-1 rounded-xl border px-5 py-3 text-sm font-black disabled:opacity-60"
        >
          Bank Transfer
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-slate-500">{label}</span>
      <b>{value}</b>
    </div>
  );
}
