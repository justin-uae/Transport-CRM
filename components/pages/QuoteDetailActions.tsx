"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { markQuotePaidAction } from "@/app/(staff)/quotes/actions";
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

export function QuoteDetailActions({ quote, canMarkPaid }: { quote: QuoteSummary; canMarkPaid: boolean }) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"markPaid" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (pending) return;
    setAction(null);
    setError(null);
  }

  function confirm() {
    if (action === "markPaid") {
      startTransition(async () => {
        const result = await markQuotePaidAction(quote.id);
        if (result?.error) {
          setError(result.error);
          notify(result.error);
          return;
        }
        notify("Quote marked as paid — invoice generated and job sent to Dispatch");
        setAction(null);
        router.refresh();
      });
    } else if (action === "resend") {
      const link = `${window.location.origin}/q/${quote.public_token}`;
      navigator.clipboard.writeText(link).then(() => notify("Invoice link copied"));
      setAction(null);
    }
  }

  return (
    <>
      {quote.status === "accepted" && canMarkPaid && (
        <button
          disabled={pending}
          onClick={() => {
            setError(null);
            setAction("markPaid");
          }}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          Mark as Paid
        </button>
      )}
      {quote.status === "paid" && (
        <button
          onClick={() => {
            setError(null);
            setAction("resend");
          }}
          className="w-full rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Resend Invoice
        </button>
      )}
      {(quote.status === "sent" || quote.status === "viewed") && (
        <button
          onClick={() => {
            const link = `${window.location.origin}/q/${quote.public_token}`;
            navigator.clipboard.writeText(link).then(() => notify("Quote link copied"));
          }}
          className="w-full rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Copy Link
        </button>
      )}

      {action && (
        <ConfirmDetailModal
          open
          onClose={close}
          title={action === "markPaid" ? "Mark this quote as paid?" : "Resend the invoice link?"}
          description={
            action === "markPaid"
              ? "This generates an invoice number and sends the job to Dispatch — only do this once the customer's bank transfer has arrived."
              : "This copies the customer's invoice link to your clipboard so you can share it again."
          }
          pending={pending}
          error={error}
          details={[
            { label: "Quote", value: quote.quote_number },
            { label: "Customer", value: quote.customerLabel },
            { label: "Value", value: money(quote.sellingPrice, quote.currency) },
            ...(action === "resend" ? [{ label: "Invoice", value: quote.invoice_number ?? "—" }] : []),
          ]}
          confirmLabel={action === "markPaid" ? "Mark as paid" : "Copy link"}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
