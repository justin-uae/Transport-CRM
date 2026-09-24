import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendWhatsAppText } from "@/lib/whatsapp360";
import { reverseGeocode } from "@/lib/reverseGeocode";
import {
  runIntakeTurn,
  hasRequiredTripFields,
  MAX_INTAKE_MESSAGES,
  type CollectedTrip,
  type ConversationMessage,
} from "@/lib/whatsappAiIntake";

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
//
// Rather than a fixed name/email/pickup/destination/date question sequence,
// this now runs a free-form AI conversation (lib/whatsappAiIntake.ts, one
// OpenAI call per inbound message) — the model both replies naturally and
// extracts the cumulative trip details from the whole transcript
// (whatsapp_intake_sessions.messages/collected, migration
// 0082_whatsapp_ai_intake.sql). A lead is only ever created once our own
// server-side check (hasRequiredTripFields), not the model's say-so alone,
// confirms all seven fields (name, email, pickup, destination, travel date,
// passenger count, notes) are present.

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
  location?: { latitude: number; longitude: number; name?: string; address?: string };
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

type IntakeStep = "active" | "done" | "handed_off";

interface IntakeSession {
  id: string;
  step: IntakeStep;
  messages: ConversationMessage[];
  collected: CollectedTrip;
  lead_id: string | null;
  created_at: string;
}

async function resolveBrand(admin: AdminClient, brandSlug: string, secret: string): Promise<Brand | null> {
  if (!brandSlug || !secret) return null;
  const { data: brand } = await admin.from("brands").select("id, tenant_id, name, webhook_secret").eq("slug", brandSlug).single();
  if (!brand || brand.webhook_secret !== secret) return null;
  return brand;
}

/** Turns whatever the contact sent into plain text for the AI and for the
    conversation log — a shared pin is reverse-geocoded into a readable
    address (falling back to raw coordinates) rather than left as
    latitude/longitude the model can't usefully read. */
async function resolveInboundText(message: WhatsAppMessage): Promise<string> {
  if (message.type === "text" && message.text?.body) return message.text.body;
  if (message.type === "location" && message.location) {
    const loc = message.location;
    if (loc.address) return `Shared location: ${loc.address}`;
    if (loc.name) return `Shared location: ${loc.name}`;
    const geocoded = await reverseGeocode(loc.latitude, loc.longitude);
    if (geocoded) return `Shared location: ${geocoded}`;
    return `Shared location: ${loc.latitude}, ${loc.longitude}`;
  }
  return `[Sent a ${message.type} message, which isn't readable yet — ask them to describe it in text.]`;
}

/** Records one row in the WhatsApp conversation log (app/(staff)/whatsapp) —
    every inbound message and every outbound send, automated or staff-typed. */
async function logWhatsAppMessage(
  admin: AdminClient,
  brand: Brand,
  waId: string,
  customerId: string | null,
  direction: "inbound" | "outbound",
  body: string,
  messageType = "text",
) {
  await admin.from("whatsapp_messages").insert({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    customer_id: customerId,
    wa_id: waId,
    direction,
    message_type: messageType,
    body,
  });
}

/** Detects a redelivered webhook (360dialog/Meta is at-least-once, not
    exactly-once) before any OpenAI call happens — a unique index on
    (brand_id, wa_message_id) for inbound rows (migration
    0083_whatsapp_message_dedup.sql) turns this insert itself into the dedup
    check. Any other insert failure fails OPEN (treated as new) rather than
    silently dropping a real customer message over a transient DB hiccup. */
async function logInboundIfNew(
  admin: AdminClient,
  brand: Brand,
  waId: string,
  customerId: string,
  body: string,
  messageType: string,
  waMessageId: string,
): Promise<boolean> {
  const { error } = await admin.from("whatsapp_messages").insert({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    customer_id: customerId,
    wa_id: waId,
    direction: "inbound",
    message_type: messageType,
    body,
    wa_message_id: waMessageId,
  });
  if (error) {
    if (error.code === "23505") return false;
    console.error(`360dialog webhook: could not log inbound message for ${waId}: ${error.message}`);
  }
  return true;
}

/** Best-effort only — an unparseable date is kept as the raw text the
    contact typed (in the lead's notes/raw_payload) rather than guessed at or
    rejected; staff can correct it on the lead like any other manually-
    entered date. */
function parseLenientDate(text: string): string | null {
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function createLeadFromSession(admin: AdminClient, brand: Brand, waId: string, customerId: string, sessionId: string, collected: CollectedTrip) {
  const travelDate = collected.travel_date ? parseLenientDate(collected.travel_date) : null;
  const name = collected.name?.trim() || waId;
  const email = collected.email?.trim() || null;

  // Merge the customer's own "anything else?" answer with the unparsed-date
  // fallback (both, one, or neither may apply) rather than one clobbering
  // the other — "None" isn't worth keeping on the lead, so it's dropped.
  const noteParts: string[] = [];
  const customerNotes = collected.notes?.trim();
  if (customerNotes && !/^(none|no|n\/a|nil|nothing)\.?$/i.test(customerNotes)) noteParts.push(customerNotes);
  if (!travelDate && collected.travel_date) noteParts.push(`Requested date (as typed via WhatsApp): ${collected.travel_date}`);
  const notes = noteParts.length ? noteParts.join(" | ") : null;

  await admin.from("customers").update({ contact_name: name, phone: waId, ...(email ? { email } : {}) }).eq("id", customerId);

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "whatsapp",
      status: "new",
      customer_id: customerId,
      pickup_text: collected.pickup,
      destination_text: collected.destination,
      passenger_count: collected.passenger_count,
      travel_date: travelDate,
      notes,
      raw_payload: { waId, ...collected },
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    console.error(`360dialog webhook: could not create lead for ${waId}: ${leadError?.message}`);
    return;
  }

  await admin
    .from("whatsapp_intake_sessions")
    .update({ step: "done", lead_id: lead.id, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

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

/** Runs one AI turn for a single inbound message: starts a fresh conversation
    if the last one is finished (or handed off), otherwise continues it. Every
    completed conversation always produces its own new lead — a contact who
    messages again later about a second trip gets a second lead, not one
    folded into the first's notes. */
async function handleInboundMessage(admin: AdminClient, brand: Brand, waId: string, contactName: string, message: WhatsAppMessage) {
  const inboundText = await resolveInboundText(message);

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
      .insert({ tenant_id: brand.tenant_id, contact_name: contactName, whatsapp: waId, phone: waId, default_brand_id: brand.id })
      .select("id")
      .single();
    customerId = created?.id ?? null;
  }
  if (!customerId) return;

  const isNewMessage = await logInboundIfNew(admin, brand, waId, customerId, inboundText, message.type, message.id);
  if (!isNewMessage) return; // redelivered webhook for a message we've already answered

  const { data: lastSession } = await admin
    .from("whatsapp_intake_sessions")
    .select("id, step, messages, collected, lead_id, created_at")
    .eq("brand_id", brand.id)
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let session = lastSession as IntakeSession | null;

  // A finished or handed-off conversation never continues automatically —
  // "done" always starts a brand new enquiry, and "handed_off" means a human
  // is already handling this contact, so the bot stays quiet rather than
  // stepping on a staff reply typed from app/(staff)/whatsapp.
  if (session?.step === "handed_off") return;

  if (!session || session.step === "done") {
    const { data: created } = await admin
      .from("whatsapp_intake_sessions")
      .insert({ tenant_id: brand.tenant_id, brand_id: brand.id, wa_id: waId, customer_id: customerId, step: "active", messages: [], collected: {} })
      .select("id, step, messages, collected, lead_id, created_at")
      .single();
    session = created as IntakeSession | null;
  }
  if (!session) return;

  const history = session.messages ?? [];

  if (history.length >= MAX_INTAKE_MESSAGES) {
    await admin.from("whatsapp_intake_sessions").update({ step: "handed_off", updated_at: new Date().toISOString() }).eq("id", session.id);
    const handoff = "Let me get one of our team to take it from here — they'll follow up with you shortly to finish arranging your trip.";
    await sendWhatsAppText(waId, handoff);
    await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", handoff);
    return;
  }

  let result;
  try {
    result = await runIntakeTurn(brand.name, history, session.collected ?? {}, inboundText);
  } catch (err) {
    console.error(`360dialog webhook: AI intake turn failed for ${waId}:`, err);
    const fallback = "Sorry, I'm having trouble replying right now — someone from our team will follow up with you shortly.";
    await sendWhatsAppText(waId, fallback);
    await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", fallback);
    return;
  }

  const updatedMessages: ConversationMessage[] = [...history, { role: "user", content: inboundText }, { role: "assistant", content: result.reply }];
  const readyForLead = result.ready && hasRequiredTripFields(result.collected);

  await admin
    .from("whatsapp_intake_sessions")
    .update({ messages: updatedMessages, collected: result.collected, updated_at: new Date().toISOString() })
    .eq("id", session.id);

  if (readyForLead) {
    await createLeadFromSession(admin, brand, waId, customerId, session.id, result.collected);
  }

  await sendWhatsAppText(waId, result.reply);
  await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", result.reply);
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
