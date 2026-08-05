import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendTemplatedEmail } from "@/lib/emailTemplates";

// Public website quote-form intake (Part 22). Authenticated by a per-brand
// shared secret (brands.webhook_secret) rather than a Supabase session — the
// website never signs in, it just knows its brand's secret. proxy.ts allows
// this path through PUBLIC_PATHS.

const WebsiteLeadSchema = z.object({
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
  passengerCount: z.coerce.number().int().positive().optional(),
  vehicleRequested: z.string().optional(),
  notes: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  referrer: z.string().optional(),
});

const HIGH_PRIORITY_PASSENGER_THRESHOLD = 50;

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = WebsiteLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const admin = createAdminClient();

  const { data: brand } = await admin
    .from("brands")
    .select("id, tenant_id, name, webhook_secret")
    .eq("slug", body.brandSlug)
    .single();

  if (!brand || brand.webhook_secret !== body.secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let customerId: string | null = null;
  if (body.email || body.phone) {
    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", brand.tenant_id)
      .or([body.email ? `email.eq.${body.email}` : null, body.phone ? `phone.eq.${body.phone}` : null].filter(Boolean).join(","))
      .limit(1)
      .maybeSingle();
    customerId = existingCustomer?.id ?? null;
  }

  if (!customerId) {
    const { data: newCustomer } = await admin
      .from("customers")
      .insert({
        tenant_id: brand.tenant_id,
        contact_name: body.name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        whatsapp: body.whatsapp ?? null,
        country: body.country ?? null,
        default_brand_id: brand.id,
      })
      .select("id")
      .single();
    customerId = newCustomer?.id ?? null;
  }

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
      passenger_count: body.passengerCount ?? null,
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

  // route_lead() (the before-insert trigger on `leads`) may have already
  // auto-assigned this lead to a staff member based on territory match — if
  // so, they wouldn't otherwise know a new order landed until they happened
  // to check the Leads list, so let them know by email straight away.
  if (lead.status === "assigned" && lead.assigned_user_id) {
    const { data: assignee } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", lead.assigned_user_id)
      .maybeSingle();

    await sendTemplatedEmail(admin, {
      tenantId: brand.tenant_id,
      key: "lead_assigned",
      to: assignee?.email,
      variables: {
        staff_name: assignee?.full_name ?? "there",
        brand_name: brand.name,
        source: "website",
        pickup: body.pickup,
        destination: body.destination,
        travel_date: body.travelDate ?? "Not specified",
        passenger_count: body.passengerCount ? String(body.passengerCount) : "Not specified",
        vehicle_requested: body.vehicleRequested ?? "Not specified",
        notes: body.notes ?? "",
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/leads?tab=mine`,
      },
    });
  }

  return NextResponse.json({ id: lead.id }, { status: 201 });
}
