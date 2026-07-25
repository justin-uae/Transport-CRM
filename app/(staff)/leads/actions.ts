"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function claimLeadAction(leadId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: lead, error } = await supabase.rpc("claim_lead", { p_lead_id: leadId });

  if (error || !lead) {
    return { error: error?.message ?? "This lead has already been claimed." };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_claimed",
    entityType: "lead",
    entityId: leadId,
  });

  revalidatePath("/leads");
  return { error: null };
}
