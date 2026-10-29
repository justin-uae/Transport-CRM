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
  const [accepting, setAccepting] = useState(false);
  const [acceptedByName, setAcceptedByName] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]!);
  const [freeText, setFreeText] = useState("");
  const [dealOffered, setDealOffered] = useState<number | null>(null);

  function confirmAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction(token, acceptedByName);
      if (result?.error) setError(result.error);
    });
  }

  function confirmReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectQuoteAction(token, freeText ? `${reason}: ${freeText}` : reason);
      if (result?.error) setError(result.error);
      // An automatic special deal re-opened the quote at a lower price — back
      // to Accept/Reject, with the new price shown above.
      else if (result?.specialDealPercent) {
        setRejecting(false);
        setDealOffered(result.specialDealPercent);
      }
    });
  }

  if (accepting) {
    return (
      <div className="rounded-2xl border p-5">
        <label className="text-sm font-bold">
          Type your name to confirm acceptance
          <input
            value={acceptedByName}
            onChange={(e) => setAcceptedByName(e.target.value)}
            placeholder="Your full name"
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={confirmAccept}
            disabled={pending}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Confirm acceptance"}
          </button>
          <button onClick={() => setAccepting(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
            Cancel
          </button>
        </div>
      </div>
    );
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
      {dealOffered && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm">
          <p className="font-black text-emerald-700">We hear you — here&apos;s {dealOffered}% off.</p>
          <p className="mt-1 text-emerald-700">The new price is shown above. Accept it below to secure this deal.</p>
        </div>
      )}
      {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => setAccepting(true)}
          disabled={pending}
          className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          Accept Quote
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
