"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { resendQuoteEmailAction, resendInvoiceEmailAction } from "@/app/(staff)/quotes/actions";
import type { QuoteStatus } from "@/lib/supabase/database.types";

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

/**
 * Marking a quote as paid now happens exclusively on the Customer Payments
 * page (it requires an attached proof of payment) — this component only
 * offers the non-mutating link-copy actions plus resending the quote email.
 */
export function QuoteDetailActions({ quote }: { quote: QuoteSummary }) {
  const notify = useToast();
  const [resendOpen, setResendOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
