"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { createBankAccountAction } from "./actions";

export function NewBankAccountForm({ brands }: { brands: { id: string; name: string; default_currency: string }[] }) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBankAccountAction({ error: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Bank account added");
      setOpen(false);
    });
  }

  if (brands.length === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
        <Plus className="mr-2 inline" size={16} />
        New Bank Account
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="mt-4 w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Brand
          <select name="brandId" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Currency
          <input name="currency" defaultValue="EUR" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Account name
          <input name="accountName" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Bank name
          <input name="bankName" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Account number
          <input name="accountNumber" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          IBAN
          <input name="iban" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Sort code
          <input name="sortCode" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          SWIFT / BIC
          <input name="swiftBic" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>
      {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add bank account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
}
