import "server-only";
import nodemailer from "nodemailer";

/**
 * Server-only SMTP transport. Only import from Server Actions/Route
 * Handlers — never a Client Component. Throws a clear error rather than
 * silently disabling email if SMTP hasn't been configured yet (same
 * pattern as lib/supabase/admin.ts / lib/stripe.ts) — callers are
 * responsible for catching this so a broken/unset mail config never breaks
 * the underlying action (see lib/emailTemplates.ts's sendTemplatedEmail).
 */
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP is not configured (SMTP_HOST/PORT/USER/PASS) — email was not sent.");
  }
  const port = Number(SMTP_PORT);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured — email was not sent.");
  }
  await getTransporter().sendMail({ from, to, subject, html, attachments });
}
