"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { uploadSupplierInvoiceAction } from "./actions";
import type { JobSupplierInvoice } from "@/lib/supabase/database.types";

export function InvoiceUploadForm({
  jobId,
  supplierId,
  invoice,
  prefillAmount = null,
  prefillCurrency = null,
}: {
  jobId: string;
  supplierId: string;
  invoice: JobSupplierInvoice | null;
  /** The company's own supplier-cost estimate, captured at quote creation — a starting point only, still editable below. */
  prefillAmount?: number | null;
  prefillCurrency?: string | null;
}) {
  const notify = useToast();
  const router = useRouter();
  const [amount, setAmount] = useState(
    invoice ? String(invoice.amount) : prefillAmount != null ? String(prefillAmount) : "",
  );
  const [currency, setCurrency] = useState(invoice?.currency ?? prefillCurrency ?? "EUR");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const isPrefilled = !invoice && prefillAmount != null;

  if (invoice?.status === "forwarded_to_accounting") {
    return (
      <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs">
        <div className="font-bold text-emerald-700">Invoice forwarded to accounting</div>
        <p className="mt-1 text-emerald-700">
          {invoice.currency} {invoice.amount.toFixed(2)} · {invoice.file_name}
        </p>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      notify("Enter an invoice amount greater than zero.");
      return;
    }
    if (!invoice && !file) {
      notify("Attach your invoice file.");
      return;
    }

    startTransition(async () => {
      let storagePath = invoice?.storage_path ?? "";
      let fileName = invoice?.file_name ?? "";

      if (file) {
        const supabase = createClient();
        const path = `${supplierId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("job-invoices").upload(path, file);
        if (uploadError) {
          notify(uploadError.message);
          return;
        }
        storagePath = path;
        fileName = file.name;
      }

      try {
        await uploadSupplierInvoiceAction(jobId, { amount: amountNum, currency, notes, storagePath, fileName });
        notify(invoice ? "Invoice updated" : "Invoice uploaded");
        setFile(null);
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the invoice.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t pt-3">
      <div className="text-xs font-bold text-slate-500">{invoice ? "Edit your invoice" : "Upload your invoice"}</div>
      <div className="flex flex-wrap gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min={0}
          step="0.01"
          placeholder="Amount"
          className="w-28 rounded-lg border px-3 py-2 text-sm"
        />
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-20 rounded-lg border px-3 py-2 text-sm"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="min-w-[8rem] flex-1 rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      {isPrefilled && (
        <p className="text-xs text-slate-400">Suggested from quote estimate — adjust if your actual invoice differs.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
        {invoice && <span className="text-xs text-slate-400">Current file: {invoice.file_name}</span>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : invoice ? "Save changes" : "Upload invoice"}
      </button>
    </form>
  );
}
