import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { getOpenAIClient } from "./openai";
import { recordAudit } from "./audit";
import { businessHoursElapsed } from "./businessHours";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsForGbpValue } from "./quoteMoney";
import { convertToGbp } from "./fxRates";
import { renderAndSendTemplate } from "./emailTemplates";
import { generateQuotePdf } from "./quotePdf";
import { persistGeneratedPdf } from "./documentArchive";
import { sendWhatsAppTemplate, normalizeWhatsAppNumber, WHATSAPP_TEMPLATE_HEADER_IMAGE_URL } from "./whatsapp360";
import { estimateTripDistance } from "./tripDistance";

type Admin = SupabaseClient<Database>;

// AI Auto-Quote (see supabase/migrations/0087_ai_auto_quote.sql and
// app/api/cron/ai-auto-quote/route.ts) — a lead that's sat unquoted for
// longer than the tenant's configured SLA (Settings -> AI Auto-Quote,
// default 24 business hours, Monday-Saturday) gets released back to the
// pool if it was assigned, and OpenAI prices and sends a real quote for it,
// exactly the way a human would from Pending Quotes -> New Quote — same
// quote_sent email, PDF, quote_events/status lifecycle. Only the pricing
// source and who clicks "send" differ.
//
// createAndSendQuote (below) is also the shared engine behind two other
// triggers that reuse this exact same pricing/build/send logic, each with
// its own tag so the lead's own Assignment history timeline (see
// LeadAssignmentHistory.tsx) can tell them apart:
// - "whatsapp_lead" — a brand-new lead captured over WhatsApp (see the
//   360dialog webhook), fired instantly at creation, tenant-gated on
//   tenants.whatsapp_auto_quote_enabled (0094_whatsapp_auto_quote.sql).
// - "manual_assign" — a Master Admin/Sales Manager explicitly assigning a
//   lead to the AI role's profile (assignLeadAction), fired instantly
//   instead of waiting for the SLA sweep to eventually pick it up.
// Both of those also try a WhatsApp send alongside the email
// (alsoSendWhatsApp) — the SLA-breach sweep path deliberately does not,
// keeping that specific trigger's behaviour exactly as it was.

export const NOT_QUOTABLE_STATUSES = ["converted", "closed", "spam", "duplicate", "expired"] as const;

export const LEAD_FOR_SWEEP_COLUMNS =
  "id, tenant_id, brand_id, customer_id, assigned_user_id, source, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, vehicle_requested, notes, created_at";

export type AiQuoteTrigger = "sla_breach" | "whatsapp_lead" | "manual_assign";

const LEAD_AUDIT_ACTION_FOR_TRIGGER: Record<AiQuoteTrigger, string> = {
  sla_breach: "ai_quote_created_sla",
  whatsapp_lead: "ai_quote_created_whatsapp_lead",
  manual_assign: "ai_quote_created_manual_assign",
};

export interface LeadForSweep {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  customer_id: string | null;
  assigned_user_id: string | null;
  source: string;
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  return_trip: boolean;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_requested: string | null;
  notes: string | null;
  created_at: string;
}

export interface PricingEstimate {
  vehicle_description: string;
  currency: string;
  supplier_estimated_cost: number;
  selling_price: number;
  customer_notes: string;
  pricing_rationale: string;
}

const PRICING_SCHEMA = {
  type: "object",
  properties: {
    vehicle_description: {
      type: "string",
      description: "A short description of the vehicle you'd recommend for this group size (e.g. \"16-seat minibus\", \"49-seat coach\").",
    },
    currency: {
      type: "string",
      description:
        "The ISO 4217 currency code (e.g. USD, EUR, GBP, AED, INR, JPY) for the country where this trip actually takes place — work it out from the pickup/destination locations, not the company's own home currency. If you can't confidently tell which country/currency applies from the addresses given, use USD as the safe default — never default to EUR.",
    },
    supplier_estimated_cost: {
      type: "number",
      description: "Your best estimate of what it would cost to hire a supplier/driver to run this trip, in the currency you chose above. Must be greater than 0.",
    },
    selling_price: {
      type: "number",
      description:
        "The price to charge the customer, in the currency you chose above — a realistic market rate for this route/vehicle/date, with a sensible margin (roughly 20-35%) over supplier_estimated_cost. Must be greater than supplier_estimated_cost.",
    },
    customer_notes: {
      type: "string",
      description: "One or two warm, professional sentences for the customer explaining what's included — shown on the quote itself.",
    },
    pricing_rationale: {
      type: "string",
      description:
        "For internal staff eyes only — a detailed, multi-sentence breakdown of how you arrived at this price, covering: (1) why this vehicle size/class for this passenger count, (2) how many hours the vehicle/driver is effectively committed for and why that drives the price more than raw distance on a day-hire/waiting-time job, (3) the distance and what it contributes to cost, (4) a realistic supplier cost RANGE (not just the single figure above) and what's in it (driver time, fuel, vehicle costs, overheads), (5) the recommended selling price with its margin as a percentage over supplier cost, and why that margin is fair for this job. Write it the way an experienced transport pricing analyst would explain their reasoning to a colleague, not a one-line summary.",
    },
  },
  required: ["vehicle_description", "currency", "supplier_estimated_cost", "selling_price", "customer_notes", "pricing_rationale"],
  additionalProperties: false,
} as const;

const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

/**
 * The one, single pricing brain for "what should this trip cost" — used
 * both to actually price and send a quote unattended (createAndSendQuote
 * below) AND, via lib/aiPriceEstimate.ts, as the Master-Admin benchmark
 * button on an existing quote. Those two used to run two separately-
 * prompted AI calls that reasoned completely differently (this one: supplier
 * cost then a margin on top; the other: a flat "market rate per km") and
 * disagreed by 3x on the same kind of trip in real testing — rather than
 * maintain two pricing philosophies that happen to agree sometimes, the
 * benchmark tool now calls this exact function too.
 */
export async function estimatePricing(
  lead: LeadForSweep,
  brandName: string,
  options?: { realDistanceKm?: number; realDurationMinutes?: number },
): Promise<PricingEstimate> {
  const client = getOpenAIClient();

  // When both times are known and the trip is a same-day return, the vehicle
  // and driver are realistically committed for the whole gap between drop-off
  // and the return pickup, not just the two drive legs — that's a day-rate
  // job, not two separate transfers, and materially changes the price. Left
  // null (and left for the model to reason about from the dates/times given)
  // whenever either time is missing or the return is a different day.
  let committedHours: number | null = null;
  if (lead.return_trip && lead.pickup_time && lead.return_time && lead.travel_date && (lead.return_date ?? lead.travel_date) === lead.travel_date) {
    const [ph, pm] = lead.pickup_time.split(":").map(Number);
    const [rh, rm] = lead.return_time.split(":").map(Number);
    if (ph !== undefined && pm !== undefined && rh !== undefined && rm !== undefined) {
      const diff = rh * 60 + rm - (ph * 60 + pm);
      if (diff > 0) committedHours = Math.round((diff / 60) * 10) / 10;
    }
  }

  const response = await client.responses.create(
    {
      // The best available reasoning-tier model, not a "mini"/fast one —
      // gpt-4o-mini's estimates for this exact kind of job (a multi-hour
      // day-hire, not a simple transfer) came back roughly 3-4x under a
      // careful human/ChatGPT estimate for the same trip. gpt-5.5 reasons
      // explicitly about vehicle class, hours committed and a real
      // supplier-cost range before landing on a number, and landed within
      // ~6% of that reference estimate in testing. Deliberately NOT
      // gpt-5.5-pro: it scored only marginally closer (~4%) but took
      // 60-100s+ per call in testing versus ~15s here — unworkable for a
      // button a person is sitting and waiting on (and risks exceeding the
      // hosting platform's own request timeout, on top of the model's own).
      // No `temperature` param: this model line doesn't accept one (fixed
      // reasoning, not sampled) — unlike gpt-4o, which needed it pinned to
      // stop the same trip swinging wildly between calls.
      model: "gpt-5.5",
      instructions:
        `You are a pricing analyst for ${brandName}, a coach and transport hire company. A lead has gone unquoted too ` +
        `long, so you're pricing and quoting the trip yourself based on typical market rates for private transport hire. ` +
        `Give a realistic, fair estimate — never a placeholder or round guess. Price it in the currency of the country ` +
        `where the trip is taking place, not any other currency. ` +
        `This quote is always full payment upfront, no deposit option — don't mention a deposit or part-payment in customer_notes. ` +
        `If the trip has a return leg on the same day, the vehicle and driver are committed for the whole time between the ` +
        `outbound drop-off and the return pickup, not just the two drive legs — price it as a day-hire/waiting-time job at ` +
        `that point (a driver sitting idle for several hours still has to be paid), not as two one-way transfers added together. ` +
        `Size the vehicle for the full passenger count given, and reason explicitly about vehicle class, hours committed, and ` +
        `distance before settling on a number — never anchor on a generic per-km airport-transfer rate for a multi-hour booking.`,
      input: [
        {
          role: "user" as const,
          content: [
            `Pickup: ${lead.pickup_text ?? "Not specified"}`,
            `Destination: ${lead.destination_text ?? "Not specified"}`,
            options?.realDistanceKm
              ? `Real driving distance (from mapping data — this is already the TOTAL for the whole trip, including the return leg if there is one; use this exact figure, do not re-estimate or re-double it): ${options.realDistanceKm} km, approx ${options.realDurationMinutes ?? "?"} minutes`
              : null,
            `Travel date: ${lead.travel_date ?? "Not specified"}`,
            lead.pickup_time ? `Pickup time: ${lead.pickup_time}` : null,
            lead.return_trip
              ? `Return date: ${lead.return_date ?? "Not specified"}${lead.return_time ? `, return time: ${lead.return_time}` : ""}`
              : "One-way trip",
            committedHours !== null
              ? `The vehicle/driver is effectively committed for approximately ${committedHours} hours in total (pickup to return pickup, same day) — price this as a day-hire/waiting-time booking.`
              : null,
            `Passengers: ${lead.passenger_count ?? "Not specified"}`,
            lead.luggage_count ? `Luggage: ${lead.luggage_count} pieces` : null,
            lead.vehicle_requested ? `Customer requested vehicle: ${lead.vehicle_requested}` : null,
            lead.notes ? `Notes: ${lead.notes}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ai_auto_quote_pricing",
          strict: true,
          schema: PRICING_SCHEMA,
        },
      },
    },
    // This reasoning-tier model takes noticeably longer than gpt-4o did
    // (several seconds to ~15-30s in testing vs a couple of seconds) — 20s
    // was too tight. maxRetries: 0 is deliberate: the OpenAI SDK retries a
    // timed-out/failed request up to 2 more times by default, so a single
    // slow call could silently stack into several minutes of total wait
    // (exactly what happened before this was set — one call ran past 4
    // minutes). One attempt, a clear error if it fails, rather than a
    // multi-minute hang on a button someone is sitting and waiting on.
    { timeout: 60000, maxRetries: 0 },
  );

  const raw = response.output_text;
  if (!raw) throw new Error("OpenAI returned no output for an AI auto-quote pricing estimate.");
  const parsed = JSON.parse(raw) as PricingEstimate;

  // "Use USD, never default to EUR" only lives in the prompt — enforce it
  // here too, in case the model returns something malformed/blank/not a
  // real 3-letter code, rather than trusting free-form model output for
  // something that ends up on a real invoice.
  const code = parsed.currency?.toUpperCase().trim();
  parsed.currency = code && CURRENCY_CODE_RE.test(code) ? code : "USD";

  // Defensive floor — never let a malformed/zero response through to a real
  // customer-facing quote. A genuinely bad estimate throws and is retried
  // (untouched) on the next sweep rather than sending something nonsensical.
  if (!(parsed.supplier_estimated_cost > 0) || !(parsed.selling_price > 0)) {
    throw new Error("AI pricing estimate returned a non-positive amount.");
  }
  if (parsed.selling_price <= parsed.supplier_estimated_cost) {
    parsed.selling_price = Math.round(parsed.supplier_estimated_cost * 1.25 * 100) / 100;
  }
  return parsed;
}

const asPgTime = (value: string | null) => (value && /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null);

/**
 * The tenant's AI-role profile, if one's been invited (Settings -> Users,
 * role "AI") — enquiries/quotes the sweep creates get attributed to it
 * (created_by, assigned_user_id) so they show up on that profile's own
 * dashboard (/quotes, the same Pending Quotes list everyone else uses —
 * there's no separate AI-only list any more, just an "AI" badge on the
 * quote) via the normal can_view_assignment RLS, the same way a human Sales
 * User's quotes show up on theirs. Permission-driven rather than a hardcoded
 * role name,
 * matching getAssignableSalesUsers (lib/leadAssignees.ts) — stays correct if
 * the role is renamed. Falls back to null (today's behaviour, Master-Admin-
 * only visibility) if no tenant profile holds it yet.
 */
export async function getAiProfileId(admin: Admin, tenantId: string): Promise<string | null> {
  const { data: perm } = await admin.from("permissions").select("id").eq("key", "quotes.view_ai_generated").maybeSingle();
  if (!perm) return null;

  const { data: roleLinks } = await admin.from("role_permissions").select("role_id").eq("permission_id", perm.id);
  const roleIds = (roleLinks ?? []).map((r) => r.role_id);
  if (roleIds.length === 0) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("role_id", roleIds)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return profile?.id ?? null;
}

/** Same shape as createEnquiryFromLeadAction (app/(staff)/leads/actions.ts), minus the human actor — reuses an existing enquiry if one somehow already exists for this lead (e.g. a previous sweep run got this far and failed after). */
async function ensureEnquiry(admin: Admin, lead: LeadForSweep, aiProfileId: string | null) {
  const { data: existing } = await admin
    .from("enquiries")
    .select("id, customer_id")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      tenant_id: lead.tenant_id,
      brand_id: lead.brand_id,
      lead_id: lead.id,
      customer_id: lead.customer_id!,
      assigned_user_id: aiProfileId,
      created_by: aiProfileId,
      status: "new",
      ai_generated: true,
    })
    .select("id, customer_id")
    .single();
  if (error || !enquiry) throw new Error(error?.message ?? "Could not create the AI auto-quote enquiry.");

  const { error: legError } = await admin.from("enquiry_legs").insert({
    enquiry_id: enquiry.id,
    sequence: 1,
    journey_type: lead.return_trip ? "return" : "one_way",
    pickup_address: lead.pickup_text ?? "Unknown",
    destination_address: lead.destination_text ?? "Unknown",
    pickup_date: lead.travel_date,
    pickup_time: asPgTime(lead.pickup_time),
    return_date: lead.return_trip ? lead.return_date : null,
    return_time: lead.return_trip ? asPgTime(lead.return_time) : null,
    passenger_count: lead.passenger_count,
    luggage_count: lead.luggage_count,
    special_requirements:
      [lead.vehicle_requested ? `Vehicle requested: ${lead.vehicle_requested}` : null, lead.notes].filter(Boolean).join(" — ") || null,
  });
  if (legError) throw new Error(legError.message);

  return enquiry;
}

/** Releases an assigned lead back to the open pool exactly like releaseLeadAction, but system-initiated (no actor) — recorded as its own audit action so Assignment history reads distinctly from a human release. */
async function releaseToPool(admin: Admin, lead: LeadForSweep) {
  if (!lead.assigned_user_id) return;

  await admin.from("leads").update({ assigned_user_id: null, status: "open_pool" }).eq("id", lead.id);

  await recordAudit({
    client: admin,
    tenantId: lead.tenant_id,
    actorId: null,
    action: "lead_released_sla_breach",
    entityType: "lead",
    entityId: lead.id,
    previousValue: { assignedUserId: lead.assigned_user_id },
  });
}

/** The full quote build + send, mirroring createQuoteAction's sendNow branch (app/(staff)/quotes/new/actions.ts) with an AI-priced version instead of staff-entered numbers, created_by set to the tenant's AI-role profile (or null if none's been invited yet), and ai_generated: true on both the enquiry and the quote. */
export async function createAndSendQuote(
  admin: Admin,
  lead: LeadForSweep,
  aiProfileId: string | null,
  options: {
    trigger: AiQuoteTrigger;
    alsoSendWhatsApp?: boolean;
    /** The human who caused this, for the "manual_assign" trigger only
        (assignLeadAction has an actual actor.id in scope) — left undefined
        for "sla_breach"/"whatsapp_lead", which are genuinely system-
        initiated, no human clicked anything. Without this, every trigger's
        audit entries recorded a null actor, so the lead timeline showed
        "Someone assigned this lead to it" even for a manual assignment a
        real Master Admin/Sales Manager just performed. */
    actorId?: string | null;
  },
) {
  const { data: brand } = await admin.from("brands").select("*").eq("id", lead.brand_id!).maybeSingle();
  if (!brand) throw new Error(`No brand found for lead ${lead.id}.`);

  const { data: customer } = await admin
    .from("customers")
    .select("contact_name, company_name, email, whatsapp, phone")
    .eq("id", lead.customer_id!)
    .maybeSingle();

  const enquiry = await ensureEnquiry(admin, lead, aiProfileId);

  // Same real-distance grounding the Master Admin "Get AI estimate" button
  // gets (lib/aiPriceEstimate.ts) — without this the model has to guess the
  // geography AND the price from two address strings alone, which is what
  // made repeated estimates for the same unchanged trip swing wildly before
  // (see the note on `estimatePricing` above). A lead's return trip is one
  // pickup/destination pair plus its own return date/time, not a separate
  // leg, so the measured one-way distance is doubled to cover the drive
  // back too — same fix as the round-trip bug in lib/aiPriceEstimate.ts and
  // lib/quotePricingBenchmark.ts.
  const legDistance = await estimateTripDistance(lead.pickup_text, lead.destination_text);
  const realDistanceKm = legDistance ? (lead.return_trip ? Math.round(legDistance.distanceKm * 2 * 10) / 10 : legDistance.distanceKm) : undefined;
  const realDurationMinutes = legDistance ? (lead.return_trip ? legDistance.durationMinutes * 2 : legDistance.durationMinutes) : undefined;

  // Priced in the currency of the country the trip actually happens in
  // (the AI works this out from pickup/destination, falling back to USD if
  // it can't tell), not the brand's own default_currency — a UK-registered
  // brand quoting a coach hire in Thailand should show THB, not GBP.
  const pricing = await estimatePricing(lead, brand.name, { realDistanceKm, realDurationMinutes });
  const currency = pricing.currency;

  const { data: quoteNumber, error: numberError } = await admin.rpc("next_document_number", {
    p_brand_id: brand.id,
    p_doc_type: "quote",
    p_prefix: brand.quote_number_prefix,
  });
  if (numberError || !quoteNumber) throw new Error(numberError?.message ?? "Could not generate a quote number.");

  const expiryDays = 7;
  const { data: quote, error: quoteError } = await admin
    .from("quotes")
    .insert({
      tenant_id: lead.tenant_id,
      brand_id: brand.id,
      enquiry_id: enquiry.id,
      customer_id: enquiry.customer_id,
      quote_number: quoteNumber,
      status: "draft",
      currency,
      expiry_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      created_by: aiProfileId,
      ai_generated: true,
    })
    .select()
    .single();
  if (quoteError || !quote) throw new Error(quoteError?.message ?? "Could not create the AI auto-quote.");

  let sellingPriceGbp: number;
  try {
    sellingPriceGbp = await convertToGbp(pricing.selling_price, currency);
  } catch {
    sellingPriceGbp = STRIPE_PRICE_THRESHOLD;
  }

  const { data: version, error: versionError } = await admin
    .from("quote_versions")
    .insert({
      quote_id: quote.id,
      version_number: 1,
      vehicle_type_id: null,
      vehicle_description: pricing.vehicle_description,
      supplier_estimated_cost: pricing.supplier_estimated_cost,
      selling_price: pricing.selling_price,
      currency,
      // Always full payment upfront, no deposit plan — an AI-priced quote
      // going out unattended shouldn't also be improvising a payment
      // schedule.
      deposit_percentage: null,
      deposit_fixed_amount: null,
      payment_methods: paymentMethodsForGbpValue(sellingPriceGbp),
      customer_notes: pricing.customer_notes,
      terms_snapshot: null,
      brand_snapshot: { name: brand.name, logo_url: brand.logo_url, primary_color: brand.primary_color },
      created_by: aiProfileId,
    })
    .select()
    .single();
  if (versionError || !version) throw new Error(versionError?.message ?? "Could not price the AI auto-quote.");

  await admin.from("quotes").update({ current_version_id: version.id, status: "sent", sent_at: new Date().toISOString() }).eq("id", quote.id);
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "sent" });
  // Re-assigns the lead to the AI profile now that it's actually quoted
  // (released to the pool above only while it was still unquoted) — without
  // this, /leads?tab=quoted (filtered on the viewer's own assigned_user_id)
  // never matches for the AI account, even though it's the one that quoted
  // it. Falls back to null (today's "AI Quoted" badge/unclaimed look, see
  // ownerLabel in components/pages/LeadsPage.tsx) if no AI profile exists yet.
  await admin.from("leads").update({ status: "converted", assigned_user_id: aiProfileId }).eq("id", lead.id);

  const publicLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`;
  const quotePdf = await generateQuotePdf(admin, quote.id).catch((err) => {
    console.error(`aiAutoQuote: generateQuotePdf failed for quote ${quote.id}:`, err);
    return null;
  });

  const emailResult = await renderAndSendTemplate(admin, {
    tenantId: lead.tenant_id,
    key: "quote_sent",
    to: customer?.email,
    variables: {
      customer_name: customer?.company_name || customer?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand.name,
      currency,
      selling_price: pricing.selling_price.toFixed(2),
      link: publicLink,
    },
    attachments: quotePdf ? [{ filename: `${quote.quote_number}.pdf`, content: quotePdf, contentType: "application/pdf" }] : undefined,
  });
  if (emailResult.error) {
    console.error(`aiAutoQuote: quote_sent email failed for quote ${quote.id}: ${emailResult.error}`);
  }

  if (quotePdf) {
    await persistGeneratedPdf(admin, {
      tenantId: lead.tenant_id,
      uploadedBy: null,
      docType: "quote",
      label: `Quote ${quote.quote_number}`,
      fileName: `${quote.quote_number}.pdf`,
      quoteId: quote.id,
      pdf: quotePdf,
    });
  }

  // Only the two newer triggers (a WhatsApp-captured lead, or a manual
  // assign-to-AI) also try WhatsApp — deliberately not the SLA-breach sweep,
  // whose behaviour this was explicitly asked to leave unchanged. Best-
  // effort and never fatal: no whatsapp/phone on file, or the send itself
  // failing, just gets logged — the email above has already gone out either
  // way, so nothing about the quote itself is left unsent.
  if (options.alsoSendWhatsApp) {
    const whatsappNumber = customer?.whatsapp || customer?.phone;
    if (whatsappNumber) {
      try {
        const waResult = await sendWhatsAppTemplate(
          normalizeWhatsAppNumber(whatsappNumber),
          "quote_sent_customer",
          [customer?.company_name || customer?.contact_name || "Customer", brand.name, quote.quote_number, `${pricing.selling_price.toFixed(2)} ${currency}`],
          quote.public_token,
          WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
        );
        if (!waResult.ok) {
          console.error(`aiAutoQuote: quote_sent WhatsApp send failed for quote ${quote.id}: ${waResult.error}`);
        }
      } catch (err) {
        console.error(`aiAutoQuote: quote_sent WhatsApp send threw for quote ${quote.id}:`, err);
      }
    }
  }

  await recordAudit({
    client: admin,
    tenantId: lead.tenant_id,
    actorId: options.actorId ?? null,
    action: "ai_quote_created",
    entityType: "quote",
    entityId: quote.id,
    newValue: {
      quoteNumber: quote.quote_number,
      sellingPrice: pricing.selling_price,
      supplierEstimatedCost: pricing.supplier_estimated_cost,
      currency,
      pricingRationale: pricing.pricing_rationale,
      leadId: lead.id,
      trigger: options.trigger,
    },
  });

  // A second, lead-scoped record purely so this shows up on the lead's own
  // Assignment history timeline (LeadAssignmentHistory.tsx reads entity_type
  // = 'lead') — the audit entry above is scoped to the quote instead, which
  // that timeline doesn't query.
  await recordAudit({
    client: admin,
    tenantId: lead.tenant_id,
    actorId: options.actorId ?? null,
    action: LEAD_AUDIT_ACTION_FOR_TRIGGER[options.trigger],
    entityType: "lead",
    entityId: lead.id,
    newValue: { quoteNumber: quote.quote_number },
  });
}

interface SweepResult {
  checked: number;
  released: number;
  quoted: number;
  failed: number;
}

/** The cron entry point (app/api/cron/ai-auto-quote/route.ts) — every tenant is swept in one pass, each governed by its own ai_auto_quote_enabled/ai_auto_quote_sla_hours (defaults false/24) and floored at ai_auto_quote_enabled_at. A lead that fails (bad pricing response, no brand, etc.) is left exactly as it was and picked up again on the next run rather than partially applied. */
export async function runAiAutoQuoteSweep(admin: Admin): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, released: 0, quoted: 0, failed: 0 };
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, ai_auto_quote_enabled, ai_auto_quote_sla_hours, ai_auto_quote_enabled_at");
  const enabledTenants = new Map(
    (tenants ?? [])
      .filter((t) => t.ai_auto_quote_enabled)
      .map((t) => [t.id, { slaHours: t.ai_auto_quote_sla_hours, enabledAt: t.ai_auto_quote_enabled_at }]),
  );
  if (enabledTenants.size === 0) return result;

  // One lookup per tenant, reused across every lead in that tenant this run.
  const aiProfileIdByTenant = new Map<string, string | null>(
    await Promise.all([...enabledTenants.keys()].map(async (tenantId): Promise<[string, string | null]> => [tenantId, await getAiProfileId(admin, tenantId)])),
  );

  const { data: leads } = await admin
    .from("leads")
    .select(LEAD_FOR_SWEEP_COLUMNS)
    .not("status", "in", `(${NOT_QUOTABLE_STATUSES.join(",")})`)
    .in("tenant_id", [...enabledTenants.keys()]);

  for (const lead of (leads ?? []) as LeadForSweep[]) {
    const tenantConfig = enabledTenants.get(lead.tenant_id);
    if (!tenantConfig) continue;
    const { slaHours, enabledAt } = tenantConfig;

    // Floored at whenever the feature was last switched on, not just the
    // lead's own created_at — otherwise every pre-existing "new"/"open_pool"
    // lead reads as instantly overdue the moment Master Admin flips it on,
    // and the sweep fires on the whole backlog in its very first run.
    const countdownStart = enabledAt && enabledAt > lead.created_at ? new Date(enabledAt) : new Date(lead.created_at);
    if (businessHoursElapsed(countdownStart, now) < slaHours) continue;

    // A trip whose date has already passed can't be served — same guard as
    // healExpiredLeads (lib/leadExpiry.ts), left for a human to close out
    // rather than auto-quoted for a date that's gone.
    if (lead.travel_date && lead.travel_date < today) continue;
    // Not enough to build a real quote from — skip rather than loop forever
    // on an incomplete lead (e.g. an unfinished WhatsApp/website capture).
    if (!lead.pickup_text || !lead.destination_text || !lead.customer_id || !lead.brand_id) continue;

    result.checked++;
    try {
      await releaseToPool(admin, lead);
      if (lead.assigned_user_id) result.released++;
      await createAndSendQuote(admin, lead, aiProfileIdByTenant.get(lead.tenant_id) ?? null, { trigger: "sla_breach" });
      result.quoted++;
    } catch (err) {
      result.failed++;
      console.error(`aiAutoQuote: failed for lead ${lead.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return result;
}
