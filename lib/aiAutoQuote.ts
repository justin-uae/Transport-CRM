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

type Admin = SupabaseClient<Database>;

// AI Auto-Quote (see supabase/migrations/0087_ai_auto_quote.sql and
// app/api/cron/ai-auto-quote/route.ts) — a lead that's sat unquoted for
// longer than the tenant's configured SLA (Settings -> AI Auto-Quote,
// default 24 business hours, Monday-Saturday) gets released back to the
// pool if it was assigned, and OpenAI prices and sends a real quote for it,
// exactly the way a human would from Pending Quotes -> New Quote — same
// quote_sent email, PDF, quote_events/status lifecycle. Only the pricing
// source and who clicks "send" differ.

const NOT_QUOTABLE_STATUSES = ["converted", "closed", "spam", "duplicate", "expired"] as const;

const LEAD_FOR_SWEEP_COLUMNS =
  "id, tenant_id, brand_id, customer_id, assigned_user_id, source, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, vehicle_requested, notes, created_at";

interface LeadForSweep {
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

interface PricingEstimate {
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
      description: "One sentence, for internal staff eyes only, explaining how you arrived at this price and currency.",
    },
  },
  required: ["vehicle_description", "currency", "supplier_estimated_cost", "selling_price", "customer_notes", "pricing_rationale"],
  additionalProperties: false,
} as const;

const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

async function estimatePricing(lead: LeadForSweep, brandName: string): Promise<PricingEstimate> {
  const client = getOpenAIClient();
  const response = await client.responses.create(
    {
      model: "gpt-4o-mini",
      instructions:
        `You are a pricing analyst for ${brandName}, a coach and transport hire company. A lead has gone unquoted too ` +
        `long, so you're pricing and quoting the trip yourself based on typical market rates for private transport hire. ` +
        `Give a realistic, fair estimate — never a placeholder or round guess. Price it in the currency of the country ` +
        `where the trip is taking place, not any other currency. ` +
        `This quote is always full payment upfront, no deposit option — don't mention a deposit or part-payment in customer_notes.`,
      input: [
        {
          role: "user" as const,
          content: [
            `Pickup: ${lead.pickup_text ?? "Not specified"}`,
            `Destination: ${lead.destination_text ?? "Not specified"}`,
            `Travel date: ${lead.travel_date ?? "Not specified"}`,
            lead.return_trip ? `Return date: ${lead.return_date ?? "Not specified"}` : "One-way trip",
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
    { timeout: 20000 },
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

/** Same shape as createEnquiryFromLeadAction (app/(staff)/leads/actions.ts), minus the human actor — reuses an existing enquiry if one somehow already exists for this lead (e.g. a previous sweep run got this far and failed after). */
async function ensureEnquiry(admin: Admin, lead: LeadForSweep) {
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
      assigned_user_id: null,
      created_by: null,
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

/** The full quote build + send, mirroring createQuoteAction's sendNow branch (app/(staff)/quotes/new/actions.ts) with an AI-priced version instead of staff-entered numbers, created_by left null throughout, and ai_generated: true on both the enquiry and the quote. */
async function createAndSendQuote(admin: Admin, lead: LeadForSweep) {
  const { data: brand } = await admin.from("brands").select("*").eq("id", lead.brand_id!).maybeSingle();
  if (!brand) throw new Error(`No brand found for lead ${lead.id}.`);

  const { data: customer } = await admin
    .from("customers")
    .select("contact_name, company_name, email")
    .eq("id", lead.customer_id!)
    .maybeSingle();

  const enquiry = await ensureEnquiry(admin, lead);
  // Priced in the currency of the country the trip actually happens in
  // (the AI works this out from pickup/destination, falling back to USD if
  // it can't tell), not the brand's own default_currency — a UK-registered
  // brand quoting a coach hire in Thailand should show THB, not GBP.
  const pricing = await estimatePricing(lead, brand.name);
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
      created_by: null,
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
      created_by: null,
    })
    .select()
    .single();
  if (versionError || !version) throw new Error(versionError?.message ?? "Could not price the AI auto-quote.");

  await admin.from("quotes").update({ current_version_id: version.id, status: "sent", sent_at: new Date().toISOString() }).eq("id", quote.id);
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "sent" });
  await admin.from("leads").update({ status: "converted" }).eq("id", lead.id);

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

  await recordAudit({
    client: admin,
    tenantId: lead.tenant_id,
    actorId: null,
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
    },
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
      await createAndSendQuote(admin, lead);
      result.quoted++;
    } catch (err) {
      result.failed++;
      console.error(`aiAutoQuote: failed for lead ${lead.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return result;
}
