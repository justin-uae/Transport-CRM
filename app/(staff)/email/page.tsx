import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { EmailCentrePage } from "@/components/pages/EmailCentrePage";

export default async function Page() {
  const profile = await requireProfile();
  const canManageTemplates = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_TEMPLATES);

  if (!canManageTemplates) {
    return <EmailCentrePage templates={[]} canManageTemplates={false} />;
  }

  const supabase = await createClient();
  const { data: templates } = await supabase.from("email_templates").select("*").order("key");

  return <EmailCentrePage templates={templates ?? []} canManageTemplates={canManageTemplates} />;
}
