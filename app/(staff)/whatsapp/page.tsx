import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { landingHrefForProfile } from "@/lib/landing";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import {
  CONVERSATION_LIST_COLUMNS,
  CONVERSATION_PAGE_SIZE,
  toConversationSummary,
  type ConversationListRow,
} from "@/lib/whatsappInbox";
import { WhatsAppInboxPage, type WhatsAppMessageRow } from "@/components/pages/WhatsAppInboxPage";

interface MessageRow {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string;
  created_at: string;
  delivery_status: "sent" | "failed";
  delivery_error: string | null;
}

/**
 * Master Admin sees every WhatsApp chat; a sales user sees only the chats
 * they own (taken over from a popup, auto-assigned because they quoted that
 * number, or assigned by Master Admin) — see 0113_whatsapp_sales_takeover.sql.
 * The list comes from whatsapp_conversations (one row per contact), newest
 * first, a page at a time — the inbox loads more and searches from there.
 */
export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!profile.is_master_admin) {
    const { data: agent } = await admin.rpc("is_whatsapp_agent", { p_profile_id: profile.id });
    if (!agent) redirect(await landingHrefForProfile(profile));
  }

  let listQuery = supabase
    .from("whatsapp_conversations")
    .select(CONVERSATION_LIST_COLUMNS)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(CONVERSATION_PAGE_SIZE);
  if (!profile.is_master_admin) listQuery = listQuery.eq("owner_id", profile.id);
  const { data: listData } = await listQuery;
  let rows = (listData ?? []) as unknown as ConversationListRow[];

  // A chat opened from the popup (?chat=) may be older than the first page.
  if (params.chat && !rows.some((r) => r.wa_id === params.chat)) {
    let chatQuery = supabase.from("whatsapp_conversations").select(CONVERSATION_LIST_COLUMNS).eq("wa_id", params.chat);
    if (!profile.is_master_admin) chatQuery = chatQuery.eq("owner_id", profile.id);
    const { data: chatRow } = await chatQuery.maybeSingle();
    if (chatRow) rows = [chatRow as unknown as ConversationListRow, ...rows];
  }

  const salesUsers = profile.is_master_admin ? await getAssignableSalesUsers(supabase) : [];
  const ownerNames = new Map(salesUsers.map((u) => [u.id, u.full_name]));
  // Owners who are no longer assignable (e.g. deactivated) still need a name.
  const missingOwnerIds = [...new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id && !ownerNames.has(id)))];
  if (missingOwnerIds.length) {
    const { data: owners } = await supabase.from("profiles").select("id, full_name").in("id", missingOwnerIds);
    for (const o of owners ?? []) ownerNames.set(o.id, o.full_name);
  }

  const conversations = rows.map((r) => toConversationSummary(r, ownerNames));
  const firstWaId = (params.chat && rows.some((r) => r.wa_id === params.chat) ? params.chat : conversations[0]?.waId) ?? null;

  let initialThread: WhatsAppMessageRow[] = [];
  if (firstWaId) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, message_type, body, created_at, delivery_status, delivery_error")
      .eq("wa_id", firstWaId)
      .order("created_at", { ascending: false })
      .limit(300);
    initialThread = ((data ?? []) as unknown as MessageRow[])
      .map((r) => ({
        id: r.id,
        direction: r.direction,
        messageType: r.message_type,
        body: r.body,
        createdAt: r.created_at,
        deliveryStatus: r.delivery_status,
        deliveryError: r.delivery_error,
      }))
      .reverse();
  }

  return (
    <WhatsAppInboxPage
      tenantId={profile.tenant_id}
      currentUserId={profile.id}
      isMasterAdmin={profile.is_master_admin}
      salesUsers={salesUsers}
      ownerNames={Object.fromEntries(ownerNames)}
      conversations={conversations}
      hasMore={(listData ?? []).length === CONVERSATION_PAGE_SIZE}
      initialSelectedWaId={firstWaId}
      initialThread={initialThread}
    />
  );
}
