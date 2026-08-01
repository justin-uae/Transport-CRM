"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { createClient } from "@/lib/supabase/client";
import { markQuotePaidAction } from "@/app/(staff)/quotes/actions";
import type { QuoteStatus } from "@/lib/supabase/database.types";

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
  quote_versions: { selling_price: number } | null;
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
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const awaiting = useMemo(() => quotes.filter((q) => q.status === "accepted"), [quotes]);
  const paid = useMemo(() => quotes.filter((q) => q.status === "paid"), [quotes]);
  const visible = tab === "awaiting" ? awaiting : paid;

  function open(q: AcceptedQuoteRow) {
    setTarget(q);
    setProofFile(null);
    setModalError(null);
  }

  function confirm() {
    if (!target) return;
    if (!proofFile) {
      setModalError("Attach proof of payment before marking this quote as paid.");
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

      const result = await markQuotePaidAction(target.id, { proofStoragePath: path, proofFileName: proofFile.name });
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Marked as paid — invoice generated and job sent to Confirmed Booking");
      setTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Accounting"
        title="Customer Payments"
        text="Quotes the customer has accepted — mark paid and attach proof once their bank transfer arrives."
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
            return (
              <div key={q.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-primary-600">{q.quote_number}</b>
                    {q.invoice_number && <span className="ml-2 text-xs text-slate-400">Inv {q.invoice_number}</span>}
                    <div className="text-sm font-semibold">{customer?.company_name || customer?.contact_name || "—"}</div>
                  </div>
                  <span className="font-black">{money(q.quote_versions?.selling_price, q.currency)}</span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  {q.status === "paid" && proofUrls[q.id] && (
                    <a href={proofUrls[q.id] ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View proof
                    </a>
                  )}
                  {q.status === "accepted" && (
                    <button
                      disabled={pending}
                      onClick={() => open(q)}
                      className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      Mark as Paid
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
          title="Mark this quote as paid?"
          description="This confirms the customer's bank transfer has arrived — attach proof of payment to record it."
          pending={pending}
          error={modalError}
          details={[
            { label: "Quote", value: target.quote_number },
            { label: "Customer", value: target.customers?.company_name || target.customers?.contact_name || "—" },
            { label: "Value", value: money(target.quote_versions?.selling_price, target.currency) },
          ]}
          confirmLabel="Mark as paid"
          onConfirm={confirm}
        >
          <label className="block text-sm font-bold">
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
