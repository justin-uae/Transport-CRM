"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { createQuoteAction } from "./actions";

const STEPS = ["Enquiry", "Vehicle", "Pricing", "Review & Send"];

interface VehicleTypeOption {
  id: string;
  name: string;
  seat_capacity: number;
}

export function NewQuoteForm({
  enquiryId,
  customerName,
  pickup,
  destination,
  pickupDate,
  passengerCount,
  defaultCurrency,
  vehicleTypes,
  canSend,
}: {
  enquiryId: string;
  customerName: string;
  pickup: string;
  destination: string;
  pickupDate: string | null;
  passengerCount: number | null;
  defaultCurrency: string;
  vehicleTypes: VehicleTypeOption[];
  canSend: boolean;
}) {
  const notify = useToast();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createQuoteAction({ error: null, link: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.link) {
        setLink(result.link);
        notify("Quote sent — share the link below");
      } else {
        notify("Quote saved as a draft");
      }
    });
  }

  if (link) {
    return (
      <Panel>
        <h2 className="text-xl font-black">Quote sent</h2>
        <p className="mt-2 text-sm text-slate-500">
          Share this link with the customer — it lets them view, accept or reject the quote without needing an account.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 p-3">
          <code className="flex-1 truncate text-sm">{link}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => notify("Link copied"))}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
          >
            Copy
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <Panel>
        <div className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(i + 1)}
              className={clsx(
                "rounded-xl px-2 py-3 text-xs font-bold md:text-sm",
                step === i + 1 ? "bg-primary-500 text-white" : step > i + 1 ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-500",
              )}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>
      </Panel>

      <div className="mt-5">
        <Panel>
          <div className={clsx(step !== 1 && "hidden")}>
            <SectionTitle title="Enquiry Summary" sub="Customer and journey details captured on this enquiry" />
            <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm">
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Customer</span>
                <b>{customerName}</b>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Journey</span>
                <b>{pickup} → {destination}</b>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Date</span>
                <b>{pickupDate ?? "Not set"}</b>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Passengers</span>
                <b>{passengerCount ?? "—"}</b>
              </div>
            </div>
          </div>

          <div className={clsx(step !== 2 && "hidden")}>
            <SectionTitle title="Select Vehicle" sub="Choose the vehicle used to price this quote" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Vehicle type
                <select name="vehicleTypeId" defaultValue={vehicleTypes[0]?.id ?? ""} className="mt-2 w-full rounded-xl border px-3 py-3 font-normal">
                  {vehicleTypes.length === 0 && <option value="">No vehicle types configured</option>}
                  {vehicleTypes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.seat_capacity} seats
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Vehicle description
                <input name="vehicleDescription" placeholder="e.g. Mercedes Sprinter, AC, executive seating" className="mt-2 w-full rounded-xl border px-3 py-3 font-normal" />
              </label>
            </div>
          </div>

          <div className={clsx(step !== 3 && "hidden")}>
            <SectionTitle title="Pricing" sub="Enter supplier cost and the customer selling price" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Currency
                <input name="currency" defaultValue={defaultCurrency} className="mt-2 w-full rounded-xl border px-3 py-3 font-normal" />
              </label>
              <label className="text-sm font-bold">
                Estimated supplier cost
                <input name="supplierEstimatedCost" type="number" min={0} step="0.01" className="mt-2 w-full rounded-xl border px-3 py-3 font-normal" />
              </label>
              <label className="text-sm font-bold">
                Selling price
                <input name="sellingPrice" type="number" min={0} step="0.01" required className="mt-2 w-full rounded-xl border px-3 py-3 font-normal" />
              </label>
              <label className="text-sm font-bold">
                Quote expiry (days)
                <input name="expiryDays" type="number" min={1} defaultValue={7} className="mt-2 w-full rounded-xl border px-3 py-3 font-normal" />
              </label>
              <fieldset className="text-sm font-bold">
                Deposit options
                <div className="mt-2 flex flex-wrap gap-3 font-normal">
                  {[25, 50, 75, 100].map((pct) => (
                    <label key={pct} className="flex items-center gap-1.5">
                      <input type="checkbox" name="depositOptions" value={pct} defaultChecked={pct === 25 || pct === 50 || pct === 100} />
                      {pct}%
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="text-sm font-bold">
                Payment methods
                <div className="mt-2 flex flex-wrap gap-3 font-normal">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="paymentStripe" defaultChecked />
                    Stripe
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="paymentBankTransfer" defaultChecked />
                    Bank transfer
                  </label>
                </div>
              </fieldset>
              <label className="text-sm font-bold md:col-span-2">
                Notes to customer
                <textarea name="customerNotes" className="mt-2 min-h-20 w-full rounded-xl border p-3 font-normal" />
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Terms & conditions
                <textarea name="terms" className="mt-2 min-h-20 w-full rounded-xl border p-3 font-normal" />
              </label>
            </div>
          </div>

          <div className={clsx(step !== 4 && "hidden")}>
            <SectionTitle title="Review & Send" sub="Confirm details, then save as a draft or send immediately" />
            <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm">
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Customer</span>
                <b>{customerName}</b>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Journey</span>
                <b>{pickup} → {destination}</b>
              </div>
            </div>
            {canSend ? (
              <label className="mt-4 flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" name="sendNow" defaultChecked />
                Send to customer immediately
              </label>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                You do not have permission to send quotes — this will be saved as a draft for a manager to send.
              </p>
            )}
          </div>

          {error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

          <div className="mt-6 flex justify-between border-t pt-5">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep(Math.max(1, step - 1))}
              className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            >
              Previous
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white"
              >
                Next Step →
              </button>
            ) : (
              <button type="submit" disabled={pending} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {pending ? "Saving…" : "Save Quote"}
              </button>
            )}
          </div>
        </Panel>
      </div>
    </form>
  );
}
