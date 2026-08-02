"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function updateEmailTemplateAction(
  id: string,
  data: { subject: string; bodyHtml: string },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ADMIN_MANAGE_TEMPLATES);
  if (!allowed) return { error: "You do not have permission to edit email templates." };

  const subject = data.subject.trim();
  const bodyHtml = data.bodyHtml.trim();
  if (!subject || !bodyHtml) return { error: "Subject and body are both required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({ subject, body_html: bodyHtml, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "email_template_updated",
    entityType: "email_template",
    entityId: id,
  });

  revalidatePath("/email");
  return { error: null };
}
