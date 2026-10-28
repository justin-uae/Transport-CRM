import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** One row of whatsapp_conversations (0113_whatsapp_sales_takeover.sql). */
export interface WhatsAppConversationRow {
  id: string;
  tenant_id: string;
  wa_id: string;
  owner_id: string | null;
  owner_source: "takeover" | "quoted" | "admin" | null;
  ai_paused: boolean;
}

/** Tenant settings for the "take over" window — Settings -> WhatsApp Takeover. */
export interface WhatsAppTakeoverSettings {
  enabled: boolean;
  start: string;
  end: string;
  days: number[];
  timezone: string;
}

export const TAKEOVER_SETTINGS_COLUMNS =
  "whatsapp_takeover_enabled, whatsapp_takeover_start, whatsapp_takeover_end, whatsapp_takeover_days, whatsapp_takeover_timezone";

export function takeoverSettingsFrom(row: Record<string, unknown> | null): WhatsAppTakeoverSettings {
  return {
    enabled: Boolean(row?.whatsapp_takeover_enabled),
    start: String(row?.whatsapp_takeover_start ?? "09:00").slice(0, 5),
    end: String(row?.whatsapp_takeover_end ?? "18:00").slice(0, 5),
    days: (row?.whatsapp_takeover_days as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
    timezone: String(row?.whatsapp_takeover_timezone ?? "Asia/Dubai"),
  };
}

/**
 * Called by the 360dialog webhook for every new inbound message: creates or
 * refreshes the contact's conversation row (the realtime update is what
 * pops the "take over" alert for sales users), and — if nobody owns the
 * chat yet — hands it to the sales user who last quoted this number.
 * Returns the row so the webhook can skip the AI while ai_paused is set.
 */
export async function touchConversationOnInbound(
  admin: AdminClient,
  input: { tenantId: string; brandId: string; customerId: string; waId: string; contactName: string; preview: string },
): Promise<WhatsAppConversationRow | null> {
  const { data: row, error } = await admin
    .from("whatsapp_conversations")
    .upsert(
      {
        tenant_id: input.tenantId,
        brand_id: input.brandId,
        customer_id: input.customerId,
        wa_id: input.waId,
        contact_name: input.contactName,
        last_inbound_at: new Date().toISOString(),
        last_inbound_preview: input.preview.slice(0, 280),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,wa_id" },
    )
    .select("id, tenant_id, wa_id, owner_id, owner_source, ai_paused")
    .single();
  if (error || !row) {
    console.error(`whatsapp: could not update conversation for ${input.waId}: ${error?.message}`);
    return null;
  }
  const conversation = row as WhatsAppConversationRow;
  if (conversation.owner_id) return conversation;

  const { data: quoteOwner } = await admin.rpc("whatsapp_quote_owner", { p_tenant_id: input.tenantId, p_wa_id: input.waId });
  if (!quoteOwner) return conversation;

  const { data: assigned } = await admin
    .from("whatsapp_conversations")
    .update({ owner_id: quoteOwner, owner_source: "quoted", owned_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .is("owner_id", null)
    .select("id, tenant_id, wa_id, owner_id, owner_source, ai_paused")
    .maybeSingle();
  return (assigned as WhatsAppConversationRow | null) ?? conversation;
}
