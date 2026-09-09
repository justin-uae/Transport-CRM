"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import {
  resendQuoteEmailAction,
  resendInvoiceEmailAction,
  cancelBookingAction,
  processRefundAction,
} from "@/app/(staff)/quotes/actions";
import type { QuoteStatus, Refund } from "@/lib/supabase/database.types";

interface QuoteSummary {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  public_token: string;
  invoice_number: string | null;
  customerLabel: string;
  sellingPrice: number | null;
}

function money(amount: number | null, currency: string) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const EMAILABLE: QuoteStatus[] = ["sent", "viewed", "accepted", "partially_paid", "paid"];
const CANCELLABLE: QuoteStatus[] = ["accepted", "partially_paid", "paid"];

/**
 * Marking a quote as paid now happens exclusively on the Customer Payments
 * page (it requires an attached proof of payment) — this component only
 * offers the non-mutating link-copy actions plus resending the quote email,
 * plus (OPS-01) cancelling an already-confirmed booking and, for Finance,
 * marking any resulting refund as processed.
 */
export function QuoteDetailActions({
  quote,
  canCancel,
  canProcessRefunds,
  refunds,
}: {
  quote: QuoteSummary;
  canCancel: boolean;
  canProcessRefunds: boolean;
  refunds: Refund[];
}) {
  const notify = useToast();
  const [resendOpen, setResendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [refundPending, startRefundTransition] = useTransition();

  function copyLink(label: string) {
    const link = `${window.location.origin}/q/${quote.public_token}`;
    navigator.clipboard.writeText(link).then(() => notify(`${label} link copied`));
  }

  function resendEmail() {
    startTransition(async () => {
      const result = await resendQuoteEmailAction(quote.id);
      notify(result?.error ? `Could not send email: ${result.error}` : "Quote email resent");
    });
  }

  function resendInvoice() {
    startTransition(async () => {
      const result = await resendInvoiceEmailAction(quote.id);
      notify(result?.error ? `Could not send invoice: ${result.error}` : "Invoice emailed to the customer");
      setResendOpen(false);
    });
  }

  function cancelBooking() {
    startTransition(async () => {
      const result = await cancelBookingAction(quote.id, cancelReason);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Booking cancelled");
      setCancelOpen(false);
      setCancelReason("");
    });
  }

  function processRefund(refundId: string) {
    startRefundTransition(async () => {
      const result = await processRefundAction(refundId);
      notify(result?.error ?? "Refund marked as processed");
    });
  }

  return (
    <>
      {quote.status === "paid" && (
        <>
          <a
            href={`/api/quotes/${quote.id}/invoice-pdf`}
            target="_blank"
            rel="noreferrer"
            className="block w-full rounded-xl border px-4 py-2.5 text-center text-sm font-bold"
          >
            Preview Invoice
          </a>
          <a
            href={`/api/quotes/${quote.id}/invoice-pdf?download=1`}
            className="mt-2 block w-full rounded-xl border px-4 py-2.5 text-center text-sm font-bold"
          >
            Download Invoice
          </a>
          <button
            onClick={() => setResendOpen(true)}
            className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold"
          >
            Resend Invoice
          </button>
        </>
      )}
      {(quote.status === "sent" || quote.status === "viewed") && (
        <button onClick={() => copyLink("Quote")} className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold">
          Copy Link
        </button>
      )}
      {EMAILABLE.includes(quote.status) && (
        <button
          onClick={resendEmail}
          disabled={pending}
          className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend Quote Email"}
        </button>
      )}
      {canCancel && CANCELLABLE.includes(quote.status) && (
        <button
          onClick={() => setCancelOpen(true)}
          className="mt-2 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
        >
          Cancel Booking
        </button>
      )}

      {refunds.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl border p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Refunds</div>
          {refunds.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <div className="font-bold">{money(r.amount, r.currency)}</div>
                <div className="text-xs capitalize text-slate-500">{r.status}</div>
              </div>
              {r.status === "pending" && canProcessRefunds && (
                <button
                  onClick={() => processRefund(r.id)}
                  disabled={refundPending}
                  className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  Mark processed
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {cancelOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setCancelOpen(false)}
          title="Cancel this booking?"
          description="The quote and any linked job will be marked cancelled, and any pending supplier offers withdrawn. If money has already been collected, a pending refund will be recorded for Finance."
          details={[
            { label: "Quote", value: quote.quote_number },
            { label: "Customer", value: quote.customerLabel },
            { label: "Value", value: money(quote.sellingPrice, quote.currency) },
          ]}
          pending={pending}
          destructive
          confirmLabel="Cancel booking"
          onConfirm={cancelBooking}
        >
          <label className="block text-sm font-bold">
            Reason
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2 min-h-20 w-full rounded-xl border px-3 py-2 font-normal"
              placeholder="Why is this booking being cancelled?"
            />
          </label>
        </ConfirmDetailModal>
      )}

      {resendOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setResendOpen(false)}
          title="Resend the invoice?"
          description="This emails the invoice PDF to the customer again."
          details={[
            { label: "Quote", value: quote.quote_number },
            { label: "Customer", value: quote.customerLabel },
            { label: "Value", value: money(quote.sellingPrice, quote.currency) },
            { label: "Invoice", value: quote.invoice_number ?? "—" },
          ]}
          pending={pending}
          confirmLabel="Resend invoice"
          onConfirm={resendInvoice}
        />
      )}
    </>
  );
}
