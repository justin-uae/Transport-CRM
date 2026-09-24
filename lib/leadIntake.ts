import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { sendTemplatedEmail } from "./emailTemplates";

type Admin = SupabaseClient<Database>;

/**
 * Shared by every automated lead-intake channel (website webhook,
 * app/api/leads/website/route.ts; email intake, lib/emailLeadIntake.ts) —
 * matches an inbound contact to an existing customer by email OR phone, or
 * creates a new one. Pulled out of the website route so a second intake
 * channel doesn't reimplement the same match/upsert logic.
 */
export async function resolveCustomerId(
  admin: Admin,
  tenantId: string,
  brandId: string,
  contact: { name: string; email?: string | null; phone?: string | null; whatsapp?: string | null; country?: string | null },
): Promise<string | null> {
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

/**
 * route_lead() (the before-insert trigger on `leads`) may have already
 * auto-assigned this lead to a staff member based on territory match — if
 * so, they wouldn't otherwise know a new enquiry landed until they happened
 * to check the Leads list, so let them know by email straight away. Shared
 * by every automated intake channel for the same reason resolveCustomerId is.
 */
export async function notifyIfAutoAssigned(
  admin: Admin,
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
