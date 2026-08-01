"use client";

import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import { CURRENCIES } from "@/lib/currencies";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsFor } from "@/lib/quoteMoney";
import { createQuoteAction } from "./actions";

const STEPS = ["Enquiry", "Pricing", "Review & Send"];
const DEPOSIT_CHOICES = [25, 50, 75] as const;

interface CustomerInfo {
  name: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
}

function CustomerSummary({ customer }: { customer: CustomerInfo }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Name</dt>
        <dd className="mt-0.5 font-semibold">{customer.name}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Contact</dt>
        <dd className="mt-0.5 font-semibold">{customer.contactName}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Email</dt>
        <dd className="mt-0.5 font-semibold">{customer.email ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Phone</dt>
        <dd className="mt-0.5 font-semibold">{customer.phone ?? "—"}</dd>
      </div>
      {customer.country && (
        <div className="col-span-2">
          <dt className="text-xs font-bold uppercase text-slate-400">Country</dt>
          <dd className="mt-0.5 font-semibold">{customer.country}</dd>
        </div>
      )}
    </dl>
  );
}

export function NewQuoteForm({
  enquiryId,
  customer,
  legs,
  defaultCurrency,
  canSend,
}: {
  enquiryId: string;
  customer: CustomerInfo;
  legs: JourneyLeg[];
  defaultCurrency: string;
  canSend: boolean;
}) {
  const notify = useToast();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [currency, setCurrency] = useState(defaultCurrency);
  const [supplierEstimatedCost, setSupplierEstimatedCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");
  const [depositPercentage, setDepositPercentage] = useState<25 | 50 | 75 | null>(null);
  const [customerNotes, setCustomerNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [sendNow, setSendNow] = useState(true);

  const sellingPriceNum = Number(sellingPrice) || 0;
  const methods = paymentMethodsFor(sellingPriceNum);
  const fullPayment = depositPercentage === null;

  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createQuoteAction({ error: null, link: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      if (result?.link) {
        setLink(result.link);
        notify("Quote sent — share the link below");
      } else {
        notify("Quote saved as a draft");
      }
    });
  }

  function openConfirm() {
    setError(null);
    setConfirmOpen(true);
  }

  function confirmSubmit() {
    if (!formRef.current) return;
    handleSubmit(new FormData(formRef.current));
  }

  const willSend = canSend && sendNow;

  const reviewContent = (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">Customer</div>
        <CustomerSummary customer={customer} />
      </div>

      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">
          Journey{legs.length > 1 ? ` (${legs.length} legs)` : ""}
        </div>
        {legs.map((leg, i) => (
          <JourneyLegDetail key={leg.sequence} leg={leg} index={i} total={legs.length} />
        ))}
        {legs.length === 0 && <p className="text-sm text-slate-500">No journey details recorded.</p>}
      </div>

      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">Pricing &amp; payment</div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Currency</dt>
            <dd className="mt-0.5 font-semibold">{currency}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Selling price</dt>
            <dd className="mt-0.5 text-base font-black text-primary-600">{sellingPriceNum ? money(sellingPriceNum) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Payment plan</dt>
            <dd className="mt-0.5 font-semibold">
              {fullPayment
                ? "Full payment upfront"
                : `${depositPercentage}% deposit now${sellingPriceNum ? ` (${money((sellingPriceNum * depositPercentage!) / 100)})` : ""}, balance later`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Payment method</dt>
            <dd className="mt-0.5 font-semibold">
              {methods.stripe ? `Online payment (Stripe) — price is below ${STRIPE_PRICE_THRESHOLD}` : `Bank transfer — price is ${STRIPE_PRICE_THRESHOLD} or above`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Quote expiry</dt>
            <dd className="mt-0.5 font-semibold">{expiryDays || 7} days</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Supplier cost (est.)</dt>
            <dd className="mt-0.5 font-semibold">{supplierEstimatedCost ? money(Number(supplierEstimatedCost)) : "—"}</dd>
          </div>
          {customerNotes && (
            <div className="col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-400">Notes to customer</dt>
              <dd className="mt-0.5 font-semibold">{customerNotes}</dd>
            </div>
          )}
          {terms && (
            <div className="col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-400">Terms &amp; conditions</dt>
              <dd className="mt-0.5 font-semibold">{terms}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );

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
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <input type="hidden" name="depositPercentage" value={depositPercentage ?? ""} />
      <Panel>
        <div className="grid grid-cols-3 gap-2">
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
            <div className="mt-5 space-y-5">
              <CustomerSummary customer={customer} />
              {legs.map((leg, i) => (
                <JourneyLegDetail key={leg.sequence} leg={leg} index={i} total={legs.length} />
              ))}
              {legs.length === 0 && <p className="text-sm text-slate-500">No journey details recorded.</p>}
            </div>
          </div>

          <div className={clsx(step !== 2 && "hidden")}>
            <SectionTitle title="Pricing" sub="Enter supplier cost and the customer selling price" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Currency
                <SearchableSelect
                  name="currency"
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, sublabel: c.symbol }))}
                />
              </label>
              <label className="text-sm font-bold">
                Estimated supplier cost
                <input
                  name="supplierEstimatedCost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={supplierEstimatedCost}
                  onChange={(e) => setSupplierEstimatedCost(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Selling price
                <input
                  name="sellingPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Quote expiry (days)
                <input
                  name="expiryDays"
                  type="number"
                  min={1}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <fieldset className="text-sm font-bold md:col-span-2">
                How does the customer pay?
                <div className="mt-2 flex flex-wrap gap-3 font-normal">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={fullPayment} onChange={() => setDepositPercentage(null)} />
                    Full payment
                  </label>
                  {DEPOSIT_CHOICES.map((pct) => (
                    <label key={pct} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={depositPercentage === pct}
                        onChange={() => setDepositPercentage(depositPercentage === pct ? null : pct)}
                      />
                      {pct}% deposit
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="rounded-xl bg-slate-50 p-3 text-sm font-normal md:col-span-2">
                <span className="font-bold">Payment method: </span>
                {methods.stripe ? (
                  <span className="font-semibold text-emerald-700">Online payment (Stripe) — price is below {STRIPE_PRICE_THRESHOLD}</span>
                ) : (
                  <span className="font-semibold text-emerald-700">Bank transfer — price is {STRIPE_PRICE_THRESHOLD} or above</span>
                )}
                <span className="ml-2 text-slate-400">Stripe and bank transfer are never both offered on the same quote.</span>
              </div>
              <label className="text-sm font-bold md:col-span-2">
                Notes to customer
                <textarea
                  name="customerNotes"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="mt-2 min-h-20 w-full rounded-xl border p-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Terms &amp; conditions
                <textarea
                  name="terms"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="mt-2 min-h-20 w-full rounded-xl border p-3 font-normal"
                />
              </label>
            </div>
          </div>

          <div className={clsx(step !== 3 && "hidden")}>
            <SectionTitle title="Review & Send" sub="Confirm details, then save as a draft or send immediately" />
            <div className="mt-5">{reviewContent}</div>
            {canSend ? (
              <label className="mt-4 flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" name="sendNow" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
                Send to customer immediately
              </label>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                You do not have permission to send quotes — this will be saved as a draft for a manager to send.
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-between border-t pt-5">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep(Math.max(1, step - 1))}
              className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            >
              Previous
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                onClick={openConfirm}
                disabled={pending}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Review & Save
              </button>
            )}
          </div>
        </Panel>
      </div>

      <ConfirmDetailModal
        open={confirmOpen}
        onClose={() => !pending && setConfirmOpen(false)}
        title={willSend ? "Send this quote to the customer?" : "Save this quote as a draft?"}
        description={
          willSend
            ? "The customer will receive a link to view, accept or reject this quote."
            : "This quote will be saved as a draft — a manager can send it later."
        }
        pending={pending}
        error={error}
        confirmLabel={willSend ? "Send quote" : "Save draft"}
        onConfirm={confirmSubmit}
      >
        {reviewContent}
      </ConfirmDetailModal>
    </form>
  );
}
