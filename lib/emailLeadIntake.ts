import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Database } from "./supabase/database.types";
import { getOpenAIClient } from "./openai";
import { recordAudit } from "./audit";
import { resolveCustomerId, notifyIfAutoAssigned } from "./leadIntake";

type Admin = SupabaseClient<Database>;

/** ImapFlow throws a bare `new Error("Command failed")` for a NO/BAD server response, with the server's actual human-readable reason stashed on `err.responseText` instead of the message itself — surface that, or the caller only ever sees the useless generic text. */
function describeImapError(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown IMAP error.";
  const responseText = (err as { responseText?: string }).responseText;
  const responseStatus = (err as { responseStatus?: string }).responseStatus;
  return [err.message, responseStatus, responseText].filter(Boolean).join(" — ");
}

// Email Lead Intake — 300+ transport-hire websites forward their contact-
// form enquiries into one shared inbox (not per-site, not per-brand). This
// sweep (runEmailLeadIntakeSweep, called hourly by
// app/api/cron/email-lead-intake/route.ts) polls that inbox over IMAP
// (imapflow + mailparser — same mechanism as the per-user Email Centre sync,
// app/api/cron/email-sync/route.ts), has OpenAI decide whether each message
// is a genuine travel/transport enquiry, and creates a `leads` row for the
// genuine ones. Spam/irrelevant mail is neither turned into a lead nor
// stored anywhere beyond a one-line dedup/audit entry (per the user's
// explicit choice) — every message is logged once by its Message-ID so a
// re-scanned inbox never processes the same email twice.
//
// Every lead created here lands on the tenant's fixed
// default_lead_inbox_brand_id (Settings/DB — no reliable way to tell which
// of 300+ sites a given forwarded email came from without knowing this
// inbox's actual forwarding setup) rather than trying to guess a brand.
//
// This inbox carries 8000+ messages of history across 300+ sites — the IMAP
// search window is hard-capped at MAX_LOOKBACK_DAYS regardless of what the
// synced_since cursor says, so a stale/reset cursor (or a first run before
// the cursor exists) can never trigger a scan of the entire mailbox.

const MAX_LOOKBACK_DAYS = 7;

// A loose but sufficient check that the model actually returned an email
// address rather than a stray phrase — e.g. "my name is Justin Email" has
// led the model to extract email: "Justin Email" (no @ at all) instead of
// leaving it null, silently discarding the real address in the From header.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EnquiryExtraction {
  is_travel_enquiry: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
  pickup: string | null;
  destination: string | null;
  travel_date: string | null;
  return_trip: boolean;
  return_date: string | null;
  passenger_count: number | null;
  notes: string | null;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    is_travel_enquiry: {
      type: "boolean",
      description:
        "True only if this email is a genuine customer enquiry about hiring a coach, minibus or other private transport. False for spam, marketing/newsletters, automated bounces/out-of-office replies, phishing, job applications, supplier/vendor pitches, or any other email that isn't a transport-hire enquiry from a customer.",
    },
    name: { type: ["string", "null"], description: "The enquirer's name, if given." },
    email: { type: ["string", "null"], description: "The enquirer's own email address to reply to — read this from the message body/signature if the visible \"From\" header looks like a forwarding/no-reply address rather than the actual customer." },
    phone: { type: ["string", "null"] },
    pickup: { type: ["string", "null"], description: "Pickup location, in the customer's own words." },
    destination: { type: ["string", "null"], description: "Destination, in the customer's own words." },
    travel_date: {
      type: ["string", "null"],
      description:
        "The travel date, resolved to an explicit calendar date if you can work it out from the email's own date (given in your instructions) plus what the customer wrote — otherwise their raw wording.",
    },
    return_trip: { type: "boolean", description: "True if a return leg is mentioned at all." },
    return_date: { type: ["string", "null"] },
    passenger_count: { type: ["integer", "null"] },
    notes: { type: ["string", "null"], description: "Anything else relevant (vehicle type, occasion, special requirements) that doesn't fit the other fields." },
  },
  required: [
    "is_travel_enquiry",
    "name",
    "email",
    "phone",
    "pickup",
    "destination",
    "travel_date",
    "return_trip",
    "return_date",
    "passenger_count",
    "notes",
  ],
  additionalProperties: false,
} as const;

/** One-shot classification — unlike the WhatsApp/AI-auto-quote flows, there's no back-and-forth: whatever the email says is all there'll ever be, so missing fields are expected and fine as long as is_travel_enquiry and a way to reach the sender are present. */
async function classifyEnquiryEmail(subject: string, bodyText: string, emailDateIso: string): Promise<EnquiryExtraction> {
  const client = getOpenAIClient();
  const response = await client.responses.create(
    {
      model: "gpt-4o-mini",
      instructions:
        `You are screening inbound emails forwarded from company transport-hire websites into one shared inbox. This ` +
        `email's own date is ${emailDateIso} — use that as "today" when resolving relative dates. Decide whether it's a ` +
        `genuine customer enquiry, and if so extract whatever trip details are actually present. Never invent a value ` +
        `that isn't there — leave a field null rather than guess, since there's no way to ask this sender a follow-up question.`,
      input: [{ role: "user" as const, content: `Subject: ${subject}\n\n${bodyText}`.slice(0, 8000) }],
      text: {
        format: {
          type: "json_schema",
          name: "email_lead_intake_extraction",
          strict: true,
          schema: EXTRACTION_SCHEMA,
        },
      },
    },
    { timeout: 20000 },
  );

  const raw = response.output_text;
  if (!raw) throw new Error("OpenAI returned no output for an email lead intake classification.");
  return JSON.parse(raw) as EnquiryExtraction;
}

interface ProcessResult {
  decision: "lead_created" | "discarded_not_travel" | "discarded_no_contact" | "discarded_duplicate" | "error";
  leadId?: string;
  detail?: string;
}

const DUPLICATE_LOOKBACK_HOURS = 48;

/** Case-insensitive, either-direction substring containment — "Kasaragod" (website's structured field) should match "Kasaragod, Kerala" (AI's free-text read of the same place from an email), not just an exact string. */
function looksLikeSamePlace(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/**
 * A site's own contact-form webhook (app/api/leads/website/route.ts) already
 * creates a lead the moment a visitor submits — but the same form submission
 * is often *also* emailed to that site's info@ address, which forwards into
 * the one shared inbox this sweep polls. Without this check, that forwarded
 * copy would create a second lead for the same enquiry.
 *
 * Matched on the SAME customer (resolveCustomerId already dedupes identity
 * by email/phone across every channel) plus overlapping trip details (same
 * travel date, or either pickup/destination looking like the same place) —
 * customer alone isn't enough, since a repeat customer asking about a
 * genuinely different trip within the lookback window must still get its
 * own lead.
 */
async function findRecentDuplicateLead(
  admin: Admin,
  tenantId: string,
  brandId: string,
  customerId: string,
  extraction: EnquiryExtraction,
): Promise<string | null> {
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_HOURS * 3600000).toISOString();
  const { data: candidates } = await admin
    .from("leads")
    .select("id, pickup_text, destination_text, travel_date")
    .eq("tenant_id", tenantId)
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .gte("created_at", since);

  for (const lead of candidates ?? []) {
    const sameDate = Boolean(extraction.travel_date && lead.travel_date && extraction.travel_date === lead.travel_date);
    if (sameDate || looksLikeSamePlace(extraction.pickup, lead.pickup_text) || looksLikeSamePlace(extraction.destination, lead.destination_text)) {
      return lead.id;
    }
  }
  return null;
}

async function processMessage(
  admin: Admin,
  tenantId: string,
  brand: { id: string; name: string },
  parsed: { subject: string | null; text: string | null; date: Date | null; fromAddress: string | null; fromName: string | null },
): Promise<ProcessResult> {
  const subject = parsed.subject ?? "(no subject)";
  const bodyText = (parsed.text ?? "").trim();
  if (!bodyText) return { decision: "discarded_not_travel", detail: "Empty body." };

  const extraction = await classifyEnquiryEmail(subject, bodyText, (parsed.date ?? new Date()).toISOString());
  if (!extraction.is_travel_enquiry) return { decision: "discarded_not_travel" };

  // The forwarded "From" header is often the forwarding service or a
  // no-reply address, not the actual customer — prefer whatever the AI read
  // out of the body/signature, and only fall back to the header when the
  // email genuinely didn't restate the sender's own contact details, or when
  // what the model extracted isn't trustworthy: EMAIL_RE alone isn't enough
  // — a well-FORMED but fabricated guess (e.g. a customer named "Daniel
  // Email" led the model to invent "daniel.email@example.com" out of thin
  // air, despite being told never to) still passes a format check. A genuine
  // email the customer actually typed will literally appear in the body —
  // one they didn't type won't, so that's the real test.
  const extractedEmail =
    extraction.email && EMAIL_RE.test(extraction.email) && bodyText.toLowerCase().includes(extraction.email.toLowerCase())
      ? extraction.email
      : null;
  const email = extractedEmail ?? parsed.fromAddress;
  const phone = extraction.phone;
  if (!email && !phone) return { decision: "discarded_no_contact" };
  const name = extraction.name ?? parsed.fromName ?? email ?? "Website enquiry";

  const customerId = await resolveCustomerId(admin, tenantId, brand.id, { name, email, phone });
  if (!customerId) return { decision: "error", detail: "Could not resolve/create a customer." };

  const duplicateLeadId = await findRecentDuplicateLead(admin, tenantId, brand.id, customerId, extraction);
  if (duplicateLeadId) return { decision: "discarded_duplicate", leadId: duplicateLeadId, detail: `Matches existing lead ${duplicateLeadId}` };

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: tenantId,
      brand_id: brand.id,
      source: "email",
      status: "new",
      customer_id: customerId,
      pickup_text: extraction.pickup,
      destination_text: extraction.destination,
      travel_date: /^\d{4}-\d{2}-\d{2}$/.test(extraction.travel_date ?? "") ? extraction.travel_date : null,
      return_trip: extraction.return_trip,
      return_date: /^\d{4}-\d{2}-\d{2}$/.test(extraction.return_date ?? "") ? extraction.return_date : null,
      passenger_count: extraction.passenger_count,
      notes:
        [extraction.notes, !extraction.travel_date ? null : /^\d{4}-\d{2}-\d{2}$/.test(extraction.travel_date) ? null : `Requested date (as written): ${extraction.travel_date}`]
          .filter(Boolean)
          .join(" | ") || null,
      raw_payload: { subject, fromAddress: parsed.fromAddress, extraction },
    })
    .select("id, status, assigned_user_id")
    .single();

  if (leadError || !lead) return { decision: "error", detail: leadError?.message ?? "Lead insert failed." };

  await recordAudit({
    client: admin,
    tenantId,
    actorId: null,
    action: "lead_created_email_intake",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "email", subject },
  });

  await notifyIfAutoAssigned(admin, lead, tenantId, brand.name, {
    source: "Email enquiry",
    pickup: extraction.pickup ?? "Not specified",
    destination: extraction.destination ?? "Not specified",
    travel_date: extraction.travel_date ?? "Not specified",
    passenger_count: extraction.passenger_count ? String(extraction.passenger_count) : "Not specified",
    vehicle_requested: "Not specified",
    notes: extraction.notes ?? "",
  });

  return { decision: "lead_created", leadId: lead.id };
}

interface SweepResult {
  checked: number;
  leadsCreated: number;
  discarded: number;
  failed: number;
  /** IMAP-connection-level failures (wrong host/port/credentials, network issue) — these used to only go to console.error, which lives on the web service's own logs, not the cron job's, making a silent connection failure indistinguishable from "nothing new to process." Surfaced here instead so the cron run's own JSON response tells the whole story. */
  errors: string[];
}

/** The cron entry point (app/api/cron/email-lead-intake/route.ts). Reports (rather than silently no-ops) if the shared inbox's IMAP credentials aren't configured yet, so that's visible in the cron run's own output instead of looking identical to "ran fine, nothing new." */
export async function runEmailLeadIntakeSweep(admin: Admin): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, leadsCreated: 0, discarded: 0, failed: 0, errors: [] };

  const host = process.env.LEADS_INBOX_IMAP_HOST;
  const port = process.env.LEADS_INBOX_IMAP_PORT;
  const user = process.env.LEADS_INBOX_IMAP_USER;
  const pass = process.env.LEADS_INBOX_IMAP_PASS;
  if (!host || !port || !user || !pass) {
    result.errors.push("LEADS_INBOX_IMAP_HOST/PORT/USER/PASS are not fully configured — the sweep did not run.");
    return result;
  }

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, default_lead_inbox_brand_id, email_lead_inbox_synced_since")
    .not("default_lead_inbox_brand_id", "is", null);

  if (!tenants || tenants.length === 0) {
    result.errors.push("No tenant has default_lead_inbox_brand_id set — nothing to sweep (see 0088_email_lead_intake.sql).");
    return result;
  }

  for (const tenant of tenants) {
    const { data: brand } = await admin.from("brands").select("id, name").eq("id", tenant.default_lead_inbox_brand_id!).maybeSingle();
    if (!brand) continue;

    const maxLookback = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86400000);
    const cursor = tenant.email_lead_inbox_synced_since ? new Date(tenant.email_lead_inbox_synced_since) : maxLookback;
    const since = cursor > maxLookback ? cursor : maxLookback;

    const client = new ImapFlow({
      host,
      port: Number(port),
      secure: process.env.LEADS_INBOX_IMAP_SECURE !== "false",
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ since }, { uid: true });
        for await (const msg of uids && uids.length > 0 ? client.fetch(uids, { source: true, uid: true }, { uid: true }) : []) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const messageId = parsed.messageId ?? `no-message-id-${msg.uid}`;

          // Insert-first dedup: if this exact message has already been
          // logged for this tenant, skip it (and the OpenAI call) entirely
          // — safe against the same email surfacing in an overlapping
          // `since` window on a later run.
          const { error: dupError } = await admin
            .from("email_lead_intake_log")
            .insert({ tenant_id: tenant.id, message_id: messageId, from_address: parsed.from?.text ?? null, subject: parsed.subject ?? null, decision: "error" });
          if (dupError) continue; // unique violation == already processed

          result.checked++;
          let outcome: ProcessResult;
          try {
            outcome = await processMessage(admin, tenant.id, brand, {
              subject: parsed.subject ?? null,
              text: parsed.text ?? null,
              date: parsed.date ?? null,
              fromAddress: parsed.from?.value?.[0]?.address ?? null,
              fromName: parsed.from?.value?.[0]?.name ?? null,
            });
          } catch (err) {
            outcome = { decision: "error", detail: describeImapError(err) };
          }

          await admin
            .from("email_lead_intake_log")
            .update({ decision: outcome.decision, lead_id: outcome.leadId ?? null, detail: outcome.detail ?? null })
            .eq("tenant_id", tenant.id)
            .eq("message_id", messageId);

          if (outcome.decision === "lead_created") result.leadsCreated++;
          else if (outcome.decision === "error") result.failed++;
          else result.discarded++;
        }
      } finally {
        lock.release();
      }
      await admin.from("tenants").update({ email_lead_inbox_synced_since: new Date().toISOString() }).eq("id", tenant.id);
    } catch (err) {
      const message = describeImapError(err);
      console.error(`emailLeadIntake: IMAP sweep failed for tenant ${tenant.id}:`, message);
      result.errors.push(`Tenant ${tenant.id}: ${message}`);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  return result;
}
