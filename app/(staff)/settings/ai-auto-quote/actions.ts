"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function updateAiAutoQuoteSettingsAction(enabled: boolean, slaHours: number) {
  const actor = await requireProfile();
  // tenants_update's RLS policy (0001_foundation.sql) is is_master_admin()
  // only, so this mirrors that at the app layer rather than introducing a
  // permission key nobody but Master Admin could actually use to save.
  if (!actor.is_master_admin) {
    return { error: "Only Master Admin can change this setting." };
  }
  if (!Number.isFinite(slaHours) || slaHours < 1 || slaHours > 500) {
    return { error: "Enter an SLA between 1 and 500 hours." };
  }
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("tenants")
    .select("ai_auto_quote_enabled")
    .eq("id", actor.tenant_id)
    .single();

  // Only stamp ai_auto_quote_enabled_at on the off -> on transition — a
  // resave while already enabled (e.g. just changing the SLA hours) must
  // never push this forward, or every lead's countdown would keep resetting
  // and the SLA would never actually breach.
  const justEnabled = enabled && !current?.ai_auto_quote_enabled;

  const { error } = await supabase
    .from("tenants")
    .update({
      ai_auto_quote_enabled: enabled,
      ai_auto_quote_sla_hours: Math.round(slaHours),
      ...(justEnabled ? { ai_auto_quote_enabled_at: new Date().toISOString() } : {}),
    })
    .eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "ai_auto_quote_settings_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: { enabled, slaHours: Math.round(slaHours) },
  });

  revalidatePath("/settings/ai-auto-quote");
  return { error: null };
}
