"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { sendWhatsAppText } from "@/lib/whatsapp360";

/**
 * Staff-typed reply to an existing WhatsApp conversation — sends via the
 * same 360dialog integration the automated intake uses, and logs the
 * outbound message so it shows up in the thread immediately (the realtime
 * subscription in WhatsAppInboxPage also picks it up for any other viewer).
 */
export async function sendWhatsAppReplyAction(customerId: string, body: string): Promise<{ error: string | null }> {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.GENERAL_WORKSPACE_ACCESS);
  if (!allowed) return { error: "You do not have permission to send WhatsApp messages." };

  const trimmed = body.trim();
  if (!trimmed) return { error: "Write a message first." };

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, tenant_id, whatsapp, phone, default_brand_id")
    .eq("id", customerId)
    .single();
  if (!customer || customer.tenant_id !== actor.tenant_id) return { error: "Customer not found." };

  const waId = customer.whatsapp || customer.phone;
  if (!waId) return { error: "This customer has no WhatsApp number on file." };

  let brandId = customer.default_brand_id;
  if (!brandId) {
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("tenant_id", actor.tenant_id)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    brandId = brand?.id ?? null;
  }
  if (!brandId) return { error: "No active brand is configured to send from." };

  await sendWhatsAppText(waId, trimmed);

  const { error } = await supabase.from("whatsapp_messages").insert({
    tenant_id: actor.tenant_id,
    brand_id: brandId,
    customer_id: customer.id,
    wa_id: waId,
    direction: "outbound",
    message_type: "text",
    body: trimmed,
    sent_by: actor.id,
  });
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "whatsapp_message_sent",
    entityType: "customer",
    entityId: customer.id,
    newValue: { waId },
  });

  revalidatePath("/whatsapp");
  return { error: null };
}
