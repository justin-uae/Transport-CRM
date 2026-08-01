"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { InvoiceUploadForm } from "@/app/supplier/dashboard/InvoiceUploadForm";
import { acceptJobOfferAction, rejectJobOfferAction, confirmJobAction, completeJobAction } from "@/app/supplier/dashboard/actions";
import type { JobOfferView, JobSupplierInvoice, SupplierPaymentStatus } from "@/lib/supabase/database.types";

const PAYMENT_STATUS_STYLE: Record<SupplierPaymentStatus, string> = {
  unpaid: "bg-blue-50 text-blue-700",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

const PAYMENT_STATUS_LABEL: Record<SupplierPaymentStatus, string> = {
  unpaid: "Invoice submitted — awaiting payment",
  partially_paid: "Partially paid",
  paid: "Paid in full",
};

function statusLabel(job: JobOfferView) {
  if (job.offer_status === "withdrawn") return "Offer withdrawn — assigned to another supplier";
  if (job.offer_status === "rejected") return "You rejected this job";
  if (job.offer_status === "sent") return "New offer — view details, then accept or reject";
  switch (job.job_status) {
    case "accepted_by_supplier":
      return "Accepted — confirm to proceed";
    case "confirmed":
      return "Confirmed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return job.job_status;
  }
}

function money(amount: number | null, currency: string) {
  if (amount == null) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

/**
 * Full-page equivalent of the staff-side job/quote/supplier detail pages —
 * a supplier reaches this via "View Details" from their job list, reads the
 * route/rate here, and takes whichever action applies (accept/reject,
 * confirm, complete, invoice) from this same page rather than a list-row
 * button, so nothing is actioned without having actually opened the detail.
 */
export function SupplierJobDetail({
  job,
  invoice,
  invoiceUrl,
  supplierId,
}: {
  job: JobOfferView;
  invoice: JobSupplierInvoice | null;
  invoiceUrl: string | null;
  supplierId: string;
}) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      try {
        await acceptJobOfferAction(job.job_id);
        notify("Accepted — please confirm to proceed");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not accept this job.");
      }
    });
  }

  function reject() {
    startTransition(async () => {
      try {
        await rejectJobOfferAction(job.job_id);
        notify("Job rejected");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not reject this job.");
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      try {
        await confirmJobAction(job.job_id);
        notify("Job confirmed");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not confirm this job.");
      }
    });
  }

  function complete() {
    startTransition(async () => {
      try {
        await completeJobAction(job.job_id);
        notify("Job marked as completed");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not complete this job.");
      }
    });
  }

  const rate = money(job.supplier_estimated_cost, job.quote_currency);

  return (
    <div>
      <PageHead
        eyebrow="Supplier Portal"
        title={job.region ?? "Job details"}
        text={statusLabel(job)}
        action={
          <Link href="/supplier/dashboard" className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to jobs
          </Link>
        }
      />

      <Panel>
        <SectionTitle title="Journey" sub="Pickup, destination and passenger details" />
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Pickup</dt>
            <dd className="mt-0.5 font-semibold">{job.pickup_address ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Destination</dt>
            <dd className="mt-0.5 font-semibold">{job.destination_address ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Date &amp; time</dt>
            <dd className="mt-0.5 font-semibold">
              {job.pickup_date ?? "TBC"} {job.pickup_time ?? ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Passengers</dt>
            <dd className="mt-0.5 font-semibold">{job.passenger_count ?? "—"}</dd>
          </div>
          {rate && (
            <div>
              <dt className="text-xs font-bold uppercase text-slate-400">Your rate</dt>
              <dd className="mt-0.5 text-base font-black text-primary-600">{rate}</dd>
            </div>
          )}
          {job.customer_name && (
            <div>
              <dt className="text-xs font-bold uppercase text-slate-400">Customer</dt>
              <dd className="mt-0.5 font-semibold">{job.customer_name}</dd>
            </div>
          )}
          {job.customer_phone && (
            <div>
              <dt className="text-xs font-bold uppercase text-slate-400">Phone</dt>
              <dd className="mt-0.5 font-semibold">{job.customer_phone}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {job.offer_status === "sent" && (
            <>
              <button
                disabled={pending}
                onClick={accept}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Please wait…" : "Accept job"}
              </button>
              <button
                disabled={pending}
                onClick={reject}
                className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
              >
                Reject
              </button>
            </>
          )}
          {job.offer_status === "accepted" && job.job_status === "accepted_by_supplier" && (
            <button
              disabled={pending}
              onClick={confirm}
              className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {pending ? "Please wait…" : "Confirm this job"}
            </button>
          )}
          {job.job_status === "confirmed" && (
            <button
              disabled={pending}
              onClick={complete}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {pending ? "Please wait…" : "Mark Completed"}
            </button>
          )}
        </div>
      </Panel>

      {job.job_status === "completed" && (job.supplier_invoice_note || job.supplier_invoice_url) && (
        <div className="mt-5">
          <Panel>
            <SectionTitle title="Payment reference from admin" />
            <div className="mt-3 text-sm">
              {job.supplier_invoice_note && <p>{job.supplier_invoice_note}</p>}
              {job.supplier_invoice_url && (
                <a href={job.supplier_invoice_url} target="_blank" rel="noreferrer" className="mt-1 block font-bold text-primary-600">
                  View invoice
                </a>
              )}
            </div>
          </Panel>
        </div>
      )}

      {(job.job_status === "confirmed" || job.job_status === "completed") && (
        <div className="mt-5">
          <Panel>
            <SectionTitle title="Invoice" />
            {invoice?.status === "forwarded_to_accounting" ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
                  <div>
                    <b>
                      {invoice.currency} {invoice.amount.toFixed(2)}
                    </b>
                    <div className="text-xs text-slate-400">{invoice.file_name}</div>
                  </div>
                  {invoiceUrl && (
                    <a href={invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View invoice
                    </a>
                  )}
                </div>
                <div className={`rounded-xl px-4 py-3 text-sm font-bold ${PAYMENT_STATUS_STYLE[job.supplier_payment_status]}`}>
                  {PAYMENT_STATUS_LABEL[job.supplier_payment_status]}
                </div>
              </div>
            ) : (
              <InvoiceUploadForm
                jobId={job.job_id}
                supplierId={supplierId}
                invoice={invoice}
                prefillAmount={job.supplier_estimated_cost}
                prefillCurrency={job.quote_currency}
              />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
