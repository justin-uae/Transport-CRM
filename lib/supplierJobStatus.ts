import type { JobOfferView } from "@/lib/supabase/database.types";

/**
 * Collapses (offer_status, job_status) into one status a supplier actually
 * cares about — shared by the job list pages, the landing overview and the
 * detail page so the label/badge/filtering logic isn't copy-pasted per page.
 */
export type SupplierJobStatusKey = "new" | "accepted" | "confirmed" | "completed" | "rejected" | "withdrawn" | "cancelled";

export function jobStatusKey(job: JobOfferView): SupplierJobStatusKey {
  if (job.offer_status === "withdrawn") return "withdrawn";
  if (job.offer_status === "rejected") return "rejected";
  if (job.offer_status === "sent") return "new";
  switch (job.job_status) {
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "accepted_by_supplier":
    default:
      return "accepted";
  }
}

/** Short label for badges/pills in lists. */
const STATUS_LABEL: Record<SupplierJobStatusKey, string> = {
  new: "New offer",
  accepted: "Accepted",
  confirmed: "Confirmed",
  completed: "Completed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
};

/** Longer sentence used on the job detail page header. */
const STATUS_DETAIL_TEXT: Record<SupplierJobStatusKey, string> = {
  new: "New offer — view details, then accept or reject",
  accepted: "Accepted — confirm to proceed",
  confirmed: "Confirmed",
  completed: "Completed",
  rejected: "You rejected this job",
  withdrawn: "Offer withdrawn — assigned to another supplier",
  cancelled: "Cancelled",
};

export function statusLabel(job: JobOfferView): string {
  return STATUS_LABEL[jobStatusKey(job)];
}

export function statusDetailText(job: JobOfferView): string {
  return STATUS_DETAIL_TEXT[jobStatusKey(job)];
}

export const STATUS_BADGE_STYLE: Record<SupplierJobStatusKey, string> = {
  new: "bg-blue-50 text-blue-700",
  accepted: "bg-amber-50 text-amber-700",
  confirmed: "bg-primary-50 text-primary-700",
  completed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
};

export function statusBadgeStyle(job: JobOfferView): string {
  return STATUS_BADGE_STYLE[jobStatusKey(job)];
}

export function isNewOffer(job: JobOfferView): boolean {
  return job.offer_status === "sent";
}

export function isActiveJob(job: JobOfferView): boolean {
  return job.offer_status === "accepted" && (job.job_status === "accepted_by_supplier" || job.job_status === "confirmed");
}

export function isClosed(job: JobOfferView): boolean {
  return job.job_status === "completed" || job.offer_status === "rejected" || job.offer_status === "withdrawn";
}
