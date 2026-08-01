"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
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

/**
 * Marking a quote as paid now happens exclusively on the Customer Payments
 * page (it requires an attached proof of payment) — this component only
 * offers the non-mutating link-copy actions.
 */
export function QuoteDetailActions({ quote }: { quote: QuoteSummary }) {
  const notify = useToast();
  const [resendOpen, setResendOpen] = useState(false);

  function copyLink(label: string) {
    const link = `${window.location.origin}/q/${quote.public_token}`;
    navigator.clipboard.writeText(link).then(() => notify(`${label} link copied`));
  }

  return (
    <>
      {quote.status === "paid" && (
        <button
          onClick={() => setResendOpen(true)}
          className="w-full rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Resend Invoice
        </button>
      )}
      {(quote.status === "sent" || quote.status === "viewed") && (
        <button onClick={() => copyLink("Quote")} className="w-full rounded-xl border px-4 py-2.5 text-sm font-bold">
          Copy Link
        </button>
      )}

      {resendOpen && (
        <ConfirmDetailModal
          open
          onClose={() => setResendOpen(false)}
          title="Resend the invoice link?"
          description="This copies the customer's invoice link to your clipboard so you can share it again."
          details={[
            { label: "Quote", value: quote.quote_number },
            { label: "Customer", value: quote.customerLabel },
            { label: "Value", value: money(quote.sellingPrice, quote.currency) },
            { label: "Invoice", value: quote.invoice_number ?? "—" },
          ]}
          confirmLabel="Copy link"
          onConfirm={() => {
            copyLink("Invoice");
            setResendOpen(false);
          }}
        />
      )}
    </>
  );
}
