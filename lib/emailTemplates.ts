import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { sendEmail, type EmailAttachment } from "./email";
import { wrapEmailHtml } from "./emailBranding";
import type { EmailTemplateKey } from "./emailTemplateInfo";

export type { EmailTemplateKey } from "./emailTemplateInfo";
export { EMAIL_TEMPLATE_INFO } from "./emailTemplateInfo";

function renderTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

interface SendTemplatedEmailInput {
  tenantId: string;
  key: EmailTemplateKey;
  to: string | null | undefined;
  variables: Record<string, string>;
  attachments?: EmailAttachment[];
}

/**
 * Looks up the tenant's editable template for `key`, substitutes
 * {{variables}}, and sends it — returning `{ error }` instead of throwing,
 * for callers that need to show the actual failure reason to a human (e.g.
 * a staff-facing "Resend email" button). For automatic triggers, use
 * sendTemplatedEmail below instead, which wraps this and never surfaces an
 * error to the caller.
 */
export async function renderAndSendTemplate(
  supabase: SupabaseClient<Database>,
  input: SendTemplatedEmailInput,
): Promise<{ error: string | null }> {
  if (!input.to) return { error: "No recipient email address on file." };

  const { data: template, error } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("tenant_id", input.tenantId)
    .eq("key", input.key)
    .maybeSingle();

  if (error || !template) {
    return { error: error?.message ?? `No "${input.key}" email template found.` };
  }

  try {
    await sendEmail({
      to: input.to,
      subject: renderTemplate(template.subject, input.variables),
      html: wrapEmailHtml(input.variables.brand_name ?? "", input.key, renderTemplate(template.body_html, input.variables)),
      attachments: input.attachments,
    });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the email." };
  }
}

/**
 * Single call-site for every automatic transactional email trigger in the
 * app (quote sent, quote accepted/rejected, job offered, ...). Same as
 * renderAndSendTemplate, but logs and swallows any failure (missing
 * template row, unset SMTP config, unreachable host, no recipient email on
 * file) rather than surfacing it, so a mail problem never breaks the
 * quote/job action that triggered it.
 */
export async function sendTemplatedEmail(supabase: SupabaseClient<Database>, input: SendTemplatedEmailInput): Promise<void> {
  const result = await renderAndSendTemplate(supabase, input);
  if (result.error) {
    console.error(`sendTemplatedEmail: failed to send "${input.key}" to ${input.to ?? "(no recipient)"}: ${result.error}`);
  }
}
