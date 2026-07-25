"use server";

import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export async function activateAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your invite link has expired. Ask an administrator to resend it." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, status")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { error: "No profile found for this account." };
  }

  await supabase
    .from("profiles")
    .update({ status: "active", requires_password_reset: false })
    .eq("id", user.id);

  await recordAudit({
    tenantId: profile.tenant_id,
    actorId: user.id,
    action: "account_activated",
    entityType: "profile",
    entityId: user.id,
    previousValue: { status: profile.status },
    newValue: { status: "active" },
  });

  return { error: null };
}
