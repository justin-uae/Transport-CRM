// Pure metadata shared by server code (lib/emailTemplates.ts) and client
// components (EmailTemplatesPage) — deliberately has no "server-only"
// import so it can be pulled into both.

export type EmailTemplateKey =
  | "quote_sent"
  | "quote_accepted"
  | "quote_rejected"
  | "job_offered"
  | "job_accepted_by_supplier"
  | "job_rejected_by_supplier"
  | "supplier_invoice_submitted"
  | "lead_assigned"
  | "feedback_request"
  | "staff_invited"
  | "supplier_invited"
  | "payment_received"
  | "booking_amended"
  | "job_amended"
  | "job_reapproval_required"
  | "job_reapproval_rejected";

/** Friendly labels + the {{variable}} tokens each template supports — shown as an editing hint in Email Centre -> Templates. */
export const EMAIL_TEMPLATE_INFO: Record<EmailTemplateKey, { label: string; description: string; variables: string[] }> = {
  quote_sent: {
    label: "Quote sent",
    description: "Sent to the customer when a quote is sent.",
    variables: ["customer_name", "quote_number", "brand_name", "currency", "selling_price", "link"],
  },
  quote_accepted: {
    label: "Quote accepted",
    description: "Sent to the assigned salesperson when a customer accepts a quote.",
    variables: ["customer_name", "quote_number", "brand_name", "link"],
  },
  quote_rejected: {
    label: "Quote rejected",
    description: "Sent to the assigned salesperson when a customer rejects a quote.",
    variables: ["customer_name", "quote_number", "brand_name", "reason", "link"],
  },
  job_offered: {
    label: "Job offered to supplier",
    description: "Sent to a supplier when a job is offered to them.",
    variables: ["supplier_name", "brand_name", "region", "pickup_date", "pickup_time", "passenger_count", "link"],
  },
  job_accepted_by_supplier: {
    label: "Job accepted by supplier",
    description: "Sent to the job's creator when a supplier accepts the job.",
    variables: ["supplier_name", "quote_number", "brand_name", "link"],
  },
  job_rejected_by_supplier: {
    label: "Job declined by supplier",
    description: "Sent to the job's creator when a supplier declines the job.",
    variables: ["supplier_name", "quote_number", "brand_name", "link"],
  },
  supplier_invoice_submitted: {
    label: "Supplier invoice submitted",
    description: "Sent to the job's creator when a supplier submits their invoice.",
    variables: ["supplier_name", "quote_number", "brand_name", "currency", "amount", "link"],
  },
  lead_assigned: {
    label: "Lead assigned to you",
    description: "Sent to a staff member when a new lead auto-routes to them.",
    variables: [
      "staff_name",
      "brand_name",
      "source",
      "pickup",
      "destination",
      "travel_date",
      "passenger_count",
      "vehicle_requested",
      "notes",
      "link",
    ],
  },
  feedback_request: {
    label: "Feedback request",
    description: "Sent to the customer when their job is marked completed.",
    variables: ["customer_name", "brand_name", "link"],
  },
  staff_invited: {
    label: "Staff invite",
    description: "Sent to a new staff user when they're invited, and again each time an admin resends the invite.",
    variables: ["user_name", "brand_name", "link"],
  },
  supplier_invited: {
    label: "Supplier invite",
    description: "Sent to a new supplier when they're invited, and again each time an admin resends the invite.",
    variables: ["supplier_name", "brand_name", "link"],
  },
  payment_received: {
    label: "Payment received",
    description: "Sent to the customer once a payment is verified/counted (immediately for card payments, after Finance verifies a bank transfer).",
    variables: ["customer_name", "quote_number", "brand_name", "currency", "amount", "balance", "link"],
  },
  booking_amended: {
    label: "Booking updated",
    description: "Sent to the customer when staff edit an already-accepted/paid booking's journey details or price.",
    variables: ["customer_name", "quote_number", "brand_name", "reason", "changes_summary", "currency", "adjustment_amount", "new_balance", "link"],
  },
  job_amended: {
    label: "Job updated",
    description: "Sent to the supplier when staff edit a job's journey details or their payout.",
    variables: ["supplier_name", "quote_number", "brand_name", "reason", "changes_summary", "payout_note", "link"],
  },
  job_reapproval_required: {
    label: "Job needs re-approval",
    description: "Sent to the supplier instead of \"Job updated\" when the edit is to a job they've already accepted or confirmed — they must approve or reject it again.",
    variables: ["supplier_name", "quote_number", "brand_name", "reason", "changes_summary", "payout_note", "link"],
  },
  job_reapproval_rejected: {
    label: "Job re-approval rejected",
    description: "Sent to the booking's owner when a supplier rejects an edited job — it's open for dispatch to a new supplier.",
    variables: ["supplier_name", "quote_number", "brand_name", "link"],
  },
};
