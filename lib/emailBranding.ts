import "server-only";
import type { EmailTemplateKey } from "./emailTemplateInfo";

/** Big bold line under the brand name — the customer/staff-facing headline for each template, distinct from the admin-facing label in emailTemplateInfo.ts. */
const EMAIL_HEADLINES: Record<EmailTemplateKey, string> = {
  quote_sent: "Your quote is ready",
  quote_accepted: "Quote accepted",
  quote_rejected: "Quote declined",
  job_offered: "New job offer",
  job_accepted_by_supplier: "Job accepted",
  job_rejected_by_supplier: "Job declined",
  supplier_invoice_submitted: "Invoice submitted",
  lead_assigned: "New lead assigned to you",
  feedback_request: "How was your trip?",
  staff_invited: "You're invited",
  supplier_invited: "You're invited",
};

/**
 * Wraps a template's inner body_html (just the message content — a
 * greeting, a few lines, maybe a bordered detail box and a button) in the
 * shared branded envelope: a thin accent line, the brand name, a headline,
 * and a footer with the standard tagline, separated from the body by a
 * real divider line. Full standalone HTML document (not just a fragment)
 * for better rendering across mail clients, with a fluid, max-width table
 * layout so it reflows correctly on narrow (mobile) screens without
 * relying on media queries, which many mail clients strip.
 *
 * Every outbound template email goes through this in renderAndSendTemplate,
 * so the look lives in exactly one place — editing a template in Email
 * Centre only ever touches the content in between.
 */
export function wrapEmailHtml(brandName: string, key: EmailTemplateKey, contentHtml: string): string {
  const name = brandName || "Global Transport CRM";
  const year = new Date().getFullYear();
  const headline = EMAIL_HEADLINES[key] ?? "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;">
    <div style="background-color:#f1f5f9;padding:32px 16px;font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background-color:#f97316;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <div style="font-size:13px;font-weight:800;color:#1e293b;letter-spacing:0.02em;">${name}</div>
            ${headline ? `<div style="margin-top:14px;font-size:24px;font-weight:800;color:#0f172a;line-height:1.3;">${headline}</div>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 32px 32px;color:#1e293b;font-size:14px;line-height:1.6;">
            ${contentHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <div style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px 32px;">
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${name} in Association with Global Bus Rental Worldwide Group Transport</p>
            <p style="margin:6px 0 0;color:#94a3b8;font-size:11px;">&copy; ${year} ${name}. This is an automated message — please do not reply directly to this email.</p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
}
