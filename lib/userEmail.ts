import "server-only";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import type { Database, EmailAccount, EmailAttachmentMeta } from "@/lib/supabase/database.types";
import type { EmailAttachment } from "@/lib/email";

/**
 * Sends mail through a staff member's own connected SMTP account (not the
 * shared transactional SMTP_* config in lib/email.ts) and records the
 * outbound copy in email_messages immediately, so it shows up in the Email
 * Centre's Sent folder without waiting for the next IMAP poll — only INBOX
 * is polled by app/api/cron/email-sync/route.ts.
 */
export async function sendUserEmail(
  supabase: SupabaseClient<Database>,
  account: EmailAccount,
  {
    to,
    cc,
    subject,
    html,
    inReplyTo,
    attachments,
  }: {
    to: string[];
    cc?: string[];
    subject: string;
    html: string;
    inReplyTo?: string | null;
    /** Already uploaded to the email-attachments bucket by the composer —
        this just downloads each one back out to hand nodemailer real bytes. */
    attachments?: EmailAttachmentMeta[];
  },
) {
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_security === "ssl",
    auth: { user: account.smtp_username, pass: decryptSecret(account.smtp_password_enc) },
  });

  let mailAttachments: { filename: string; content: Buffer; contentType?: string }[] | undefined;
  if (attachments && attachments.length > 0) {
    mailAttachments = [];
    for (const att of attachments) {
      if (!att.storagePath) continue;
      const { data, error } = await supabase.storage.from("email-attachments").download(att.storagePath);
      if (error || !data) {
        console.error(`sendUserEmail: could not download attachment ${att.storagePath}: ${error?.message}`);
        continue;
      }
      mailAttachments.push({
        filename: att.filename,
        content: Buffer.from(await data.arrayBuffer()),
        contentType: att.contentType ?? undefined,
      });
    }
  }

  const info = await transporter.sendMail({
    from: `"${account.display_name}" <${account.email_address}>`,
    to: to.join(", "),
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html,
    inReplyTo: inReplyTo ?? undefined,
    attachments: mailAttachments,
  });

  const { error } = await supabase.from("email_messages").insert({
    tenant_id: account.tenant_id,
    email_account_id: account.id,
    direction: "outbound",
    folder: "sent",
    message_uid: info.messageId ?? crypto.randomUUID(),
    message_id: info.messageId ?? null,
    in_reply_to: inReplyTo ?? null,
    thread_key: inReplyTo ?? info.messageId ?? null,
    from_name: account.display_name,
    from_address: account.email_address,
    to_addresses: to,
    cc_addresses: cc ?? [],
    subject,
    body_html: html,
    body_text: null,
    snippet: html.replace(/<[^>]+>/g, "").slice(0, 200),
    has_attachments: (attachments?.length ?? 0) > 0,
    attachment_meta: attachments ?? [],
    is_read: true,
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Sent, but could not save it to the Email Centre: ${error.message}`);
}

/**
 * Sends a system-triggered transactional email (a quote, an invoice) from a
 * staff member's own connected mailbox instead of the shared SMTP_* sender
 * in lib/email.ts — used by lib/emailTemplates.ts whenever the action has a
 * logged-in actor with a mailbox connected. Takes raw Buffer attachments
 * (the PDF is generated in memory, never uploaded to the email-attachments
 * bucket first) rather than sendUserEmail's EmailAttachmentMeta shape.
 * Logging the outbound copy to email_messages is best-effort — a failure
 * there must never take down the actual customer-facing send.
 */
export async function sendTransactionalEmailFromAccount(
  supabase: SupabaseClient<Database>,
  account: EmailAccount,
  { to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: EmailAttachment[] },
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_security === "ssl",
    auth: { user: account.smtp_username, pass: decryptSecret(account.smtp_password_enc) },
  });

  const info = await transporter.sendMail({
    from: `"${account.display_name}" <${account.email_address}>`,
    to,
    subject,
    html,
    attachments,
  });

  const { error } = await supabase.from("email_messages").insert({
    tenant_id: account.tenant_id,
    email_account_id: account.id,
    direction: "outbound",
    folder: "sent",
    message_uid: info.messageId ?? crypto.randomUUID(),
    message_id: info.messageId ?? null,
    in_reply_to: null,
    thread_key: info.messageId ?? null,
    from_name: account.display_name,
    from_address: account.email_address,
    to_addresses: [to],
    cc_addresses: [],
    subject,
    body_html: html,
    body_text: null,
    snippet: html.replace(/<[^>]+>/g, "").slice(0, 200),
    has_attachments: (attachments?.length ?? 0) > 0,
    attachment_meta: [],
    is_read: true,
    occurred_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`sendTransactionalEmailFromAccount: sent, but could not log to Email Centre: ${error.message}`);
  }
}
