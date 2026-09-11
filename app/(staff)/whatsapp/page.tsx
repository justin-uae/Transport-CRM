import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { landingHrefForProfile } from "@/lib/landing";
import { WhatsAppInboxPage, type ConversationSummary, type WhatsAppMessageRow } from "@/components/pages/WhatsAppInboxPage";

const MESSAGE_SCAN_LIMIT = 500;

interface MessageRow {
  id: string;
  wa_id: string;
  customer_id: string | null;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string;
  created_at: string;
  customers: { contact_name: string; company_name: string | null; phone: string | null } | null;
}

export default async function WhatsAppPage() {
  const profile = await requireProfile();
  if (!(await hasPermission(profile, PERMISSIONS.GENERAL_WORKSPACE_ACCESS))) {
    redirect(await landingHrefForProfile(profile));
  }
  const supabase = await createClient();

  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, wa_id, customer_id, direction, message_type, body, created_at, customers(contact_name, company_name, phone)")
    .order("created_at", { ascending: false })
    .limit(MESSAGE_SCAN_LIMIT);
  const rows = (data ?? []) as unknown as MessageRow[];

  const conversationsByWaId = new Map<string, ConversationSummary>();
  for (const row of rows) {
    const existing = conversationsByWaId.get(row.wa_id);
    if (existing) continue; // rows are newest-first, so the first one seen per wa_id is the latest
    conversationsByWaId.set(row.wa_id, {
      waId: row.wa_id,
      customerId: row.customer_id,
      name: row.customers?.company_name || row.customers?.contact_name || row.wa_id,
      phone: row.customers?.phone ?? row.wa_id,
      lastBody: row.body,
      lastDirection: row.direction,
      lastAt: row.created_at,
    });
  }
  const conversations = [...conversationsByWaId.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  const firstWaId = conversations[0]?.waId ?? null;
  const initialThread: WhatsAppMessageRow[] = firstWaId
    ? rows
        .filter((r) => r.wa_id === firstWaId)
        .map((r) => ({ id: r.id, direction: r.direction, messageType: r.message_type, body: r.body, createdAt: r.created_at }))
        .reverse()
    : [];

  return (
    <WhatsAppInboxPage
      tenantId={profile.tenant_id}
      conversations={conversations}
      initialSelectedWaId={firstWaId}
      initialThread={initialThread}
    />
  );
}
