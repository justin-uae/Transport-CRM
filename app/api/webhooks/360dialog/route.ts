import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendWhatsAppText, sendWhatsAppLocationRequest } from "@/lib/whatsapp360";
import { reverseGeocode } from "@/lib/reverseGeocode";

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
// Rather than create a lead from whatever a contact's first message says,
// this runs a short guided Q&A (whatsapp_intake_sessions,
// 0051_whatsapp_lead_intake.sql) — name, email, pickup, destination, travel
// date — sending each next prompt back over WhatsApp, and only creates the
// actual lead once all five are collected.

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

type IntakeStep = "awaiting_name" | "awaiting_email" | "awaiting_pickup" | "awaiting_destination" | "awaiting_date" | "done";

interface IntakeSession {
  id: string;
  step: IntakeStep;
  name: string | null;
  email: string | null;
  pickup: string | null;
  destination: string | null;
  lead_id: string | null;
  created_at: string;
}

// A completed conversation older than this starts a fresh intake for what's
// treated as a new enquiry; a completed one still within the window just
// gets this message appended to the lead it already produced (mirrors the
// "same route within 24h" duplicate guard the website quote form uses).
const REOPEN_WINDOW_HOURS = 24;

async function resolveBrand(admin: AdminClient, brandSlug: string, secret: string): Promise<Brand | null> {
  if (!brandSlug || !secret) return null;
  const { data: brand } = await admin.from("brands").select("id, tenant_id, name, webhook_secret").eq("slug", brandSlug).single();
  if (!brand || brand.webhook_secret !== secret) return null;
  return brand;
}

function messageText(message: WhatsAppMessage): string {
  if (message.type === "text" && message.text?.body) return message.text.body;
  return `Sent a ${message.type} message (not yet supported here)`;
}

/**
 * The pickup/destination questions send a "Send Location" button
 * (sendWhatsAppLocationRequest) but still accept a typed answer as a
 * fallback for a contact who ignores the button — resolves whichever one
 * actually arrived into a single address string for the lead. A shared pin
 * with no name/address of its own gets reverse-geocoded; if that also fails
 * (no Maps key configured, or the lookup itself fails), the raw
 * coordinates are kept rather than losing the answer entirely.
 */
async function resolveAddressAnswer(message: WhatsAppMessage, fallbackText: string): Promise<string> {
  if (message.type === "location" && message.location) {
    const loc = message.location;
    if (loc.address) return loc.address;
    if (loc.name) return loc.name;
    const geocoded = await reverseGeocode(loc.latitude, loc.longitude);
    if (geocoded) return geocoded;
    return `${loc.latitude}, ${loc.longitude}`;
  }
  return fallbackText;
}

/** Best-effort only — an unparseable date is kept as the raw text the
    contact typed (in travel_date_raw and the lead's notes) rather than
    guessed at or rejected; staff can correct it on the lead like any other
    manually-entered date. */
function parseLenientDate(text: string): string | null {
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function createLeadFromSession(admin: AdminClient, brand: Brand, waId: string, customerId: string, session: IntakeSession, dateText: string) {
  const travelDate = parseLenientDate(dateText);
  const name = session.name?.trim() || waId;
  const email = session.email?.trim() || null;

  await admin.from("customers").update({ contact_name: name, ...(email ? { email } : {}) }).eq("id", customerId);

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "whatsapp",
      status: "new",
      customer_id: customerId,
      pickup_text: session.pickup,
      destination_text: session.destination,
      travel_date: travelDate,
      notes: travelDate ? null : `Requested date (as typed via WhatsApp): ${dateText}`,
      raw_payload: { waId, name, email, pickup: session.pickup, destination: session.destination, travelDateText: dateText },
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    console.error(`360dialog webhook: could not create lead for ${waId}: ${leadError?.message}`);
    return;
  }

  await admin
    .from("whatsapp_intake_sessions")
    .update({ travel_date_raw: dateText, step: "done", lead_id: lead.id, updated_at: new Date().toISOString() })
    .eq("id", session.id);

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "whatsapp", waId },
  });

  await sendWhatsAppText(
    waId,
    `Thanks ${name}! We've got your request — ${session.pickup} to ${session.destination}${
      travelDate ? ` on ${travelDate}` : ` (${dateText})`
    }. Our team will be in touch shortly.`,
  );
}

/** Runs one step of the guided intake for a single inbound message: either
    starts a fresh conversation, advances an in-progress one (recording this
    message as the answer to whatever was last asked), or — if this contact
    already finished a conversation recently — folds the message into that
    lead's notes instead of starting the Q&A over. */
async function handleInboundMessage(admin: AdminClient, brand: Brand, waId: string, contactName: string, message: WhatsAppMessage) {
  const text = messageText(message).trim();

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
      .insert({ tenant_id: brand.tenant_id, contact_name: contactName, whatsapp: waId, default_brand_id: brand.id })
      .select("id")
      .single();
    customerId = created?.id ?? null;
  }
  if (!customerId) return;

  const { data: lastSession } = await admin
    .from("whatsapp_intake_sessions")
    .select("id, step, name, email, pickup, destination, lead_id, created_at")
    .eq("brand_id", brand.id)
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const session = lastSession as IntakeSession | null;

  if (session && session.step !== "done") {
    switch (session.step) {
      case "awaiting_name":
        await admin
          .from("whatsapp_intake_sessions")
          .update({ name: text, step: "awaiting_email", updated_at: new Date().toISOString() })
          .eq("id", session.id);
        await sendWhatsAppText(waId, `Thanks ${text}! What's the best email to reach you at?`);
        return;
      case "awaiting_email":
        await admin
          .from("whatsapp_intake_sessions")
          .update({ email: text, step: "awaiting_pickup", updated_at: new Date().toISOString() })
          .eq("id", session.id);
        await sendWhatsAppLocationRequest(waId, "Where would you like to be picked up from? Tap below to share the location, or just type it.");
        return;
      case "awaiting_pickup": {
        const pickup = await resolveAddressAnswer(message, text);
        await admin
          .from("whatsapp_intake_sessions")
          .update({ pickup, step: "awaiting_destination", updated_at: new Date().toISOString() })
          .eq("id", session.id);
        await sendWhatsAppLocationRequest(waId, "And where are you headed to? Tap below to share the location, or just type it.");
        return;
      }
      case "awaiting_destination": {
        const destination = await resolveAddressAnswer(message, text);
        await admin
          .from("whatsapp_intake_sessions")
          .update({ destination, step: "awaiting_date", updated_at: new Date().toISOString() })
          .eq("id", session.id);
        await sendWhatsAppText(waId, "What date do you need this trip?");
        return;
      }
      case "awaiting_date":
        await createLeadFromSession(admin, brand, waId, customerId, session, text);
        return;
    }
  }

  // A finished conversation, still recent — treat this as more context on
  // the same enquiry rather than restarting the Q&A.
  if (session && session.step === "done") {
    const since = new Date(Date.now() - REOPEN_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    if (session.created_at >= since && session.lead_id) {
      const { data: lead } = await admin.from("leads").select("notes").eq("id", session.lead_id).maybeSingle();
      const updatedNotes = [lead?.notes, `[${new Date().toISOString()}] ${text}`].filter(Boolean).join("\n");
      await admin.from("leads").update({ notes: updatedNotes }).eq("id", session.lead_id);
      return;
    }
  }

  // No active session, and nothing recent to fold into — start a new
  // guided intake. This first message is the trigger, not an answer.
  await admin.from("whatsapp_intake_sessions").insert({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    wa_id: waId,
    customer_id: customerId,
    step: "awaiting_name",
  });
  await sendWhatsAppText(waId, "👋 Thanks for reaching out! Could you tell us your name?");
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
