import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

// Inbound WhatsApp -> lead creation via 360dialog (a WhatsApp Business
// Solution Provider built directly on Meta's Cloud API — same webhook
// payload shape as Meta's own docs). Authenticated by the same
// brand-slug + webhook_secret pair the website lead intake route uses
// (app/api/leads/website/route.ts, visible to an admin in
// Settings -> Brands via BrandCredentials.tsx) — since WhatsApp's payload
// schema is fixed by Meta and can't carry our own auth fields in the body,
// the credentials travel as query params on the URL registered with
// 360dialog instead: POST https://<app>/api/webhooks/360dialog?brand=<slug>&secret=<secret>
// proxy.ts allows this path through PUBLIC_PATHS (no Supabase session exists
// for an inbound webhook call).

type AdminClient = ReturnType<typeof createAdminClient>;

interface WhatsAppContact {
  profile?: { name?: string };
  wa_id: string;
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppValue {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
}

interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppWebhookBody {
  object?: string;
  entry?: WhatsAppEntry[];
}

interface Brand {
  id: string;
  tenant_id: string;
  name: string;
}

const DEDUP_WINDOW_HOURS = 24;

async function resolveBrand(admin: AdminClient, brandSlug: string, secret: string): Promise<Brand | null> {
  if (!brandSlug || !secret) return null;
  const { data: brand } = await admin.from("brands").select("id, tenant_id, name, webhook_secret").eq("slug", brandSlug).single();
  if (!brand || brand.webhook_secret !== secret) return null;
  return brand;
}

function messageText(message: WhatsAppMessage): string {
  if (message.type === "text" && message.text?.body) return message.text.body;
  return `Sent a ${message.type} message (not yet supported for text preview)`;
}

/**
 * Folds repeat messages from the same WhatsApp contact within
 * DEDUP_WINDOW_HOURS into one lead's notes instead of creating a new lead
 * per message — a real WhatsApp conversation is almost never a single
 * message. Mirrors the "same route within 24h" duplicate guard the website
 * quote-form intake already uses, just keyed on contact instead of route.
 */
async function handleInboundMessage(admin: AdminClient, brand: Brand, waId: string, name: string, message: WhatsAppMessage) {
  const text = messageText(message);

  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", brand.tenant_id)
    .eq("whatsapp", waId)
    .maybeSingle();

  let customerId = existingCustomer?.id ?? null;
  if (!customerId) {
    const { data: created } = await admin
      .from("customers")
      .insert({ tenant_id: brand.tenant_id, contact_name: name, whatsapp: waId, default_brand_id: brand.id })
      .select("id")
      .single();
    customerId = created?.id ?? null;
  }

  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recentLead } = await admin
    .from("leads")
    .select("id, notes")
    .eq("brand_id", brand.id)
    .eq("source", "whatsapp")
    .eq("customer_id", customerId)
    .gte("created_at", since)
    .not("status", "in", "(closed,spam,duplicate)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentLead) {
    const updatedNotes = [recentLead.notes, `[${new Date().toISOString()}] ${text}`].filter(Boolean).join("\n");
    await admin.from("leads").update({ notes: updatedNotes }).eq("id", recentLead.id);
    return;
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "whatsapp",
      status: "new",
      customer_id: customerId,
      notes: text,
      raw_payload: { waId, name, message },
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    console.error(`360dialog webhook: could not create lead for ${waId}: ${leadError?.message}`);
    return;
  }

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "whatsapp", waId },
  });
}

export async function POST(request: NextRequest) {
  const brandSlug = request.nextUrl.searchParams.get("brand") ?? "";
  const secret = request.nextUrl.searchParams.get("secret") ?? "";

  const admin = createAdminClient();
  const brand = await resolveBrand(admin, brandSlug, secret);
  if (!brand) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as WhatsAppWebhookBody | null;
  // Ack with 200 even on an unparseable/empty body — 360dialog (like Meta)
  // retries a webhook that doesn't return 2xx, and there's nothing to retry
  // here since the payload itself was the problem, not a transient failure.
  if (!body?.entry) return NextResponse.json({ ok: true });

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const messages = change.value.messages ?? [];
      if (messages.length === 0) continue; // delivery/read status updates, not a new message

      const contact = change.value.contacts?.[0];
      const waId = contact?.wa_id ?? messages[0]?.from;
      if (!waId) continue;
      const name = contact?.profile?.name?.trim() || waId;

      for (const message of messages) {
        await handleInboundMessage(admin, brand, waId, name, message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
