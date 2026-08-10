"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { InvoiceUploadForm } from "@/app/supplier/dashboard/InvoiceUploadForm";
import { acceptJobOfferAction, rejectJobOfferAction, confirmJobAction, completeJobAction } from "@/app/supplier/dashboard/actions";
import { statusDetailText } from "@/lib/supplierJobStatus";
import { formatDateAndTime } from "@/lib/formatDate";
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
  const [modal, setModal] = useState<"accept" | "reject" | "confirm" | "complete" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  function closeModal() {
    setModal(null);
    setModalError(null);
  }

  function accept() {
    setModalError(null);
    startTransition(async () => {
      try {
        await acceptJobOfferAction(job.job_id);
        closeModal();
        notify("Accepted — please confirm to proceed");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not accept this job.");
      }
    });
  }

  function reject() {
    setModalError(null);
    startTransition(async () => {
      try {
        await rejectJobOfferAction(job.job_id);
        closeModal();
        notify("Job rejected");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not reject this job.");
      }
    });
  }

  function confirm() {
    setModalError(null);
    startTransition(async () => {
      try {
        await confirmJobAction(job.job_id);
        closeModal();
        notify("Job confirmed");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not confirm this job.");
      }
    });
  }

  function complete() {
    setModalError(null);
    startTransition(async () => {
      try {
        await completeJobAction(job.job_id);
        closeModal();
        notify("Job marked as completed");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not complete this job.");
      }
    });
  }

  const rate = money(job.supplier_estimated_cost, job.quote_currency);
  const journeyDetails = [
    { label: "Region", value: job.region ?? "—" },
    { label: "Date & time", value: job.pickup_date ? formatDateAndTime(job.pickup_date, job.pickup_time) : "TBC" },
    { label: "Passengers", value: job.passenger_count ?? "—" },
    ...(rate ? [{ label: "Your rate", value: rate }] : []),
  ];

  return (
    <div>
      <PageHead
        eyebrow="Supplier Portal"
        title={job.region ?? "Job details"}
        text={statusDetailText(job)}
        action={
          <Link href="/supplier/dashboard" className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to dashboard
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
            <dd className="mt-0.5 font-semibold">{job.pickup_date ? formatDateAndTime(job.pickup_date, job.pickup_time) : "TBC"}</dd>
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
                onClick={() => setModal("accept")}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white"
              >
                Accept job
              </button>
              <button
                onClick={() => setModal("reject")}
                className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600"
              >
                Reject
              </button>
            </>
          )}
          {job.offer_status === "accepted" && job.job_status === "accepted_by_supplier" && (
            <button onClick={() => setModal("confirm")} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white">
              Confirm this job
            </button>
          )}
          {job.job_status === "confirmed" && (
            <button onClick={() => setModal("complete")} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">
              Mark Completed
            </button>
          )}
        </div>
      </Panel>

      <ConfirmDetailModal
        open={modal === "accept"}
        onClose={closeModal}
        title="Accept this job?"
        description="You're committing to carry out this journey — the office will be notified."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Accept job"
        onConfirm={accept}
      />

      <ConfirmDetailModal
        open={modal === "reject"}
        onClose={closeModal}
        title="Reject this job offer?"
        description="This offer will go back to the office so they can send it to another supplier."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        destructive
        confirmLabel="Reject offer"
        onConfirm={reject}
      />

      <ConfirmDetailModal
        open={modal === "confirm"}
        onClose={closeModal}
        title="Confirm this job?"
        description="Confirm once you're set to carry out this journey as scheduled."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Confirm job"
        onConfirm={confirm}
      />

      <ConfirmDetailModal
        open={modal === "complete"}
        onClose={closeModal}
        title="Mark this job as completed?"
        description="Once completed you'll be able to submit your invoice for this job."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Mark completed"
        onConfirm={complete}
      />

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
