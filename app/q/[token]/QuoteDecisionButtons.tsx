"use client";

import { useState, useTransition } from "react";
import { acceptQuoteAction, rejectQuoteAction } from "./actions";

const REJECT_REASONS = [
  "Too expensive",
  "Cancelled trip",
  "Booked elsewhere",
  "Dates changed",
  "Requirements changed",
  "Other",
];

export function QuoteDecisionButtons({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]!);
  const [freeText, setFreeText] = useState("");

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction(token);
      if (result?.error) setError(result.error);
    });
  }

  function confirmReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectQuoteAction(token, freeText ? `${reason}: ${freeText}` : reason);
      if (result?.error) setError(result.error);
    });
  }

  if (rejecting) {
    return (
      <div className="rounded-2xl border p-5">
        <label className="text-sm font-bold">
          Why are you rejecting this quote?
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {REJECT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-bold">
          Additional comments (optional)
          <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border p-3 font-normal" />
        </label>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={confirmReject}
            disabled={pending}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Confirm rejection"}
          </button>
          <button onClick={() => setRejecting(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={accept}
          disabled={pending}
          className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {pending ? "Please wait…" : "Accept Quote"}
        </button>
        <button
          onClick={() => setRejecting(true)}
          disabled={pending}
          className="flex-1 rounded-xl border px-5 py-3 text-sm font-black disabled:opacity-60"
        >
          Reject Quote
        </button>
      </div>
    </div>
  );
}
