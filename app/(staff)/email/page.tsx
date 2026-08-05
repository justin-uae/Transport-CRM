import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { EmailCentrePage } from "@/components/pages/EmailCentrePage";
import { sanitizeEmailHtml } from "@/lib/sanitizeEmailHtml";
import type { EmailAccount, EmailMessage } from "@/lib/supabase/database.types";

export default async function Page() {
  const profile = await requireProfile();
  const canManageTemplates = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_TEMPLATES);
  const supabase = await createClient();

  const [{ data: templates }, { data: account }] = await Promise.all([
    canManageTemplates
      ? supabase.from("email_templates").select("*").order("key")
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("email_accounts").select("*").eq("user_id", profile.id).maybeSingle(),
  ]);

  let messages: EmailMessage[] = [];
  if (account) {
    const { data } = await supabase
      .from("email_messages")
      .select("*")
      .eq("email_account_id", account.id)
      .order("occurred_at", { ascending: false })
      .limit(100);
    messages = (data ?? []).map((m) =>
      m.direction === "inbound" && m.body_html ? { ...m, body_html: sanitizeEmailHtml(m.body_html) } : m,
    );
  }

  return (
    <EmailCentrePage
      templates={templates ?? []}
      canManageTemplates={canManageTemplates}
      account={(account as EmailAccount) ?? null}
      messages={messages}
    />
  );
}
