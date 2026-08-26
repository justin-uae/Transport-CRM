import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendTemplatedEmail } from "@/lib/emailTemplates";

// Public website intake (Part 22). Authenticated by a per-brand shared
// secret (brands.webhook_secret) rather than a Supabase session — the
// website never signs in, it just knows its brand's secret. proxy.ts allows
// this path through PUBLIC_PATHS.
//
// One endpoint, two form types, picked by the body's "formType":
//   - "quote"   (default, unchanged): the journey-specific quote-request
//               form — pickup, destination, travel date... source 'website'.
//   - "contact": a general "Contact Us" enquiry — no journey, just a name, a
//               way to reach back, and a message. source 'website_contact'.
// Both land in `leads`; the distinct source is what lets the Leads
// workspace and Control Centre label and chart them separately.

type AdminClient = ReturnType<typeof createAdminClient>;

const UtmFields = {
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  referrer: z.string().optional(),
};

const QuoteLeadSchema = z.object({
  brandSlug: z.string().min(1),
  secret: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  pickup: z.string().min(1),
  destination: z.string().min(1),
  travelDate: z.string().optional(),
  pickupTime: z.string().optional(),
  passengerCount: z.coerce.number().int().positive().optional(),
  luggageCount: z.coerce.number().int().nonnegative().optional(),
  vehicleRequested: z.string().optional(),
  returnTrip: z.boolean().optional(),
  returnDate: z.string().optional(),
  returnTime: z.string().optional(),
  notes: z.string().optional(),
  ...UtmFields,
});

const ContactLeadSchema = z.object({
  brandSlug: z.string().min(1),
  secret: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  serviceNeeded: z.string().optional(),
  passengerCount: z.coerce.number().int().positive().optional(),
  luggageCount: z.coerce.number().int().nonnegative().optional(),
  travelDate: z.string().optional(),
  pickupTime: z.string().optional(),
  returnTrip: z.boolean().optional(),
  returnDate: z.string().optional(),
  returnTime: z.string().optional(),
  message: z.string().min(1),
  ...UtmFields,
});

const HIGH_PRIORITY_PASSENGER_THRESHOLD = 50;

/** `returnTrip` can arrive true with no date/time yet (customer knows they need a return leg, hasn't picked one) — infer it from either signal so a bare returnDate/returnTime still counts as a return trip even if the flag itself was left out. */
function isReturnTrip(body: { returnTrip?: boolean; returnDate?: string; returnTime?: string }) {
  return Boolean(body.returnTrip || body.returnDate || body.returnTime);
}

/** Combined "date at time" for the lead_assigned email, since the template has one {{travel_date}} slot rather than a separate time variable. */
function formatWhen(date?: string, time?: string) {
  const when = [date, time].filter(Boolean).join(" at ");
  return when || "Not specified";
}

async function resolveBrand(admin: AdminClient, brandSlug: string, secret: string) {
  const { data: brand } = await admin
    .from("brands")
    .select("id, tenant_id, name, webhook_secret")
    .eq("slug", brandSlug)
    .single();

  if (!brand || brand.webhook_secret !== secret) return null;
  return brand;
}

async function resolveCustomerId(
  admin: AdminClient,
  tenantId: string,
  brandId: string,
  contact: { name: string; email?: string; phone?: string; whatsapp?: string; country?: string },
) {
  if (contact.email || contact.phone) {
    const { data: existing } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .or([contact.email ? `email.eq.${contact.email}` : null, contact.phone ? `phone.eq.${contact.phone}` : null].filter(Boolean).join(","))
      .limit(1)
      .maybeSingle();
    if (existing) {
      // Matching on email OR phone means a submission that only shares one
      // of the two (e.g. same email, new phone number) still resolves to
      // this same customer — keep their record current with whatever the
      // visitor just told us instead of silently ignoring it once matched.
      await admin
        .from("customers")
        .update({
          contact_name: contact.name,
          ...(contact.email ? { email: contact.email } : {}),
          ...(contact.phone ? { phone: contact.phone } : {}),
          ...(contact.whatsapp ? { whatsapp: contact.whatsapp } : {}),
          ...(contact.country ? { country: contact.country } : {}),
        })
        .eq("id", existing.id);
      return existing.id;
    }
  }

  const { data: created } = await admin
    .from("customers")
    .insert({
      tenant_id: tenantId,
      contact_name: contact.name,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      whatsapp: contact.whatsapp ?? null,
      country: contact.country ?? null,
      default_brand_id: brandId,
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

// route_lead() (the before-insert trigger on `leads`) may have already
// auto-assigned this lead to a staff member based on territory match — if
// so, they wouldn't otherwise know a new order landed until they happened
// to check the Leads list, so let them know by email straight away.
async function notifyIfAutoAssigned(
  admin: AdminClient,
  lead: { status: string; assigned_user_id: string | null },
  tenantId: string,
  brandName: string,
  journeyVariables: Record<string, string>,
) {
  if (lead.status !== "assigned" || !lead.assigned_user_id) return;

  const { data: assignee } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", lead.assigned_user_id)
    .maybeSingle();

  await sendTemplatedEmail(admin, {
    tenantId,
    key: "lead_assigned",
    to: assignee?.email,
    variables: {
      staff_name: assignee?.full_name ?? "there",
      brand_name: brandName,
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/leads?tab=mine`,
      ...journeyVariables,
    },
  });
}

async function handleContactSubmission(json: unknown) {
  const parsed = ContactLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid contact payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const brand = await resolveBrand(admin, body.brandSlug, body.secret);
  if (!brand) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const customerId = await resolveCustomerId(admin, brand.tenant_id, brand.id, body);

  const notes = [body.serviceNeeded ? `Service needed: ${body.serviceNeeded}` : null, body.message].filter(Boolean).join("\n");

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "website_contact",
      status: "new",
      customer_id: customerId,
      travel_date: body.travelDate ?? null,
      pickup_time: body.pickupTime ?? null,
      return_trip: isReturnTrip(body),
      return_date: body.returnDate ?? null,
      return_time: body.returnTime ?? null,
      passenger_count: body.passengerCount ?? null,
      luggage_count: body.luggageCount ?? null,
      notes,
      utm_source: body.utmSource ?? null,
      utm_medium: body.utmMedium ?? null,
      utm_campaign: body.utmCampaign ?? null,
      utm_term: body.utmTerm ?? null,
      utm_content: body.utmContent ?? null,
      referrer: body.referrer ?? null,
      raw_payload: body,
    })
    .select("id, status, assigned_user_id")
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Could not create the lead." }, { status: 500 });
  }

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "website_contact", serviceNeeded: body.serviceNeeded ?? null },
  });

  await notifyIfAutoAssigned(admin, lead, brand.tenant_id, brand.name, {
    source: "Website contact form",
    pickup: "Not specified",
    destination: "Not specified",
    travel_date: formatWhen(body.travelDate, body.pickupTime),
    passenger_count: body.passengerCount ? String(body.passengerCount) : "Not specified",
    vehicle_requested: "Not specified",
    notes,
  });

  return NextResponse.json({ id: lead.id }, { status: 201 });
}

async function handleQuoteSubmission(json: unknown) {
  const parsed = QuoteLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const brand = await resolveBrand(admin, body.brandSlug, body.secret);
  if (!brand) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const customerId = await resolveCustomerId(admin, brand.tenant_id, brand.id, body);

  // Simple duplicate guard (Part 27): same brand, same route and travel date,
  // submitted again within the last 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: possibleDuplicate } = await admin
    .from("leads")
    .select("id")
    .eq("brand_id", brand.id)
    .eq("pickup_text", body.pickup)
    .eq("destination_text", body.destination)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "website",
      status: possibleDuplicate ? "duplicate" : "new",
      customer_id: customerId,
      pickup_text: body.pickup,
      destination_text: body.destination,
      travel_date: body.travelDate ?? null,
      pickup_time: body.pickupTime ?? null,
      return_trip: isReturnTrip(body),
      return_date: body.returnDate ?? null,
      return_time: body.returnTime ?? null,
      passenger_count: body.passengerCount ?? null,
      luggage_count: body.luggageCount ?? null,
      vehicle_requested: body.vehicleRequested ?? null,
      notes: body.notes ?? null,
      priority: (body.passengerCount ?? 0) >= HIGH_PRIORITY_PASSENGER_THRESHOLD ? "high" : "normal",
      utm_source: body.utmSource ?? null,
      utm_medium: body.utmMedium ?? null,
      utm_campaign: body.utmCampaign ?? null,
      utm_term: body.utmTerm ?? null,
      utm_content: body.utmContent ?? null,
      referrer: body.referrer ?? null,
      raw_payload: body,
    })
    .select("id, status, assigned_user_id")
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Could not create the lead." }, { status: 500 });
  }

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "website", pickup: body.pickup, destination: body.destination },
  });

  await notifyIfAutoAssigned(admin, lead, brand.tenant_id, brand.name, {
    source: "Website",
    pickup: body.pickup,
    destination: body.destination,
    travel_date: formatWhen(body.travelDate, body.pickupTime),
    passenger_count: body.passengerCount ? String(body.passengerCount) : "Not specified",
    vehicle_requested: body.vehicleRequested ?? "Not specified",
    notes: body.notes ?? "",
  });

  return NextResponse.json({ id: lead.id }, { status: 201 });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if ((json as { formType?: unknown }).formType === "contact") {
    return handleContactSubmission(json);
  }
  return handleQuoteSubmission(json);
}
