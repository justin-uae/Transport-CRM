import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { sendEmail } from "./email";
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
}

/**
 * Single call-site for every transactional email trigger in the app. Looks
 * up the tenant's editable template for `key`, substitutes {{variables}},
 * and sends it — logging and swallowing any failure (missing template row,
 * unset SMTP config, unreachable host, no recipient email on file) rather
 * than throwing, so a mail problem never breaks the quote/job action that
 * triggered it.
 */
export async function sendTemplatedEmail(supabase: SupabaseClient<Database>, input: SendTemplatedEmailInput): Promise<void> {
  if (!input.to) return;

  try {
    const { data: template, error } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("tenant_id", input.tenantId)
      .eq("key", input.key)
      .maybeSingle();

    if (error || !template) {
      console.error(`sendTemplatedEmail: no template found for key "${input.key}"`, error?.message);
      return;
    }

    await sendEmail({
      to: input.to,
      subject: renderTemplate(template.subject, input.variables),
      html: renderTemplate(template.body_html, input.variables),
    });
  } catch (err) {
    console.error(`sendTemplatedEmail: failed to send "${input.key}" to ${input.to}`, err instanceof Error ? err.message : err);
  }
}
