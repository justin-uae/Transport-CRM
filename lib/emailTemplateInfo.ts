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
  | "supplier_invoice_submitted";

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
    variables: ["customer_name", "quote_number", "link"],
  },
  quote_rejected: {
    label: "Quote rejected",
    description: "Sent to the assigned salesperson when a customer rejects a quote.",
    variables: ["customer_name", "quote_number", "reason", "link"],
  },
  job_offered: {
    label: "Job offered to supplier",
    description: "Sent to a supplier when a job is offered to them.",
    variables: ["supplier_name", "region", "pickup_date", "pickup_time", "passenger_count", "link"],
  },
  job_accepted_by_supplier: {
    label: "Job accepted by supplier",
    description: "Sent to the job's creator when a supplier accepts the job.",
    variables: ["supplier_name", "quote_number", "link"],
  },
  job_rejected_by_supplier: {
    label: "Job declined by supplier",
    description: "Sent to the job's creator when a supplier declines the job.",
    variables: ["supplier_name", "quote_number", "link"],
  },
  supplier_invoice_submitted: {
    label: "Supplier invoice submitted",
    description: "Sent to the job's creator when a supplier submits their invoice.",
    variables: ["supplier_name", "quote_number", "currency", "amount", "link"],
  },
};
