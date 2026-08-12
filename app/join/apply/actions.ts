"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import type { SupplierType } from "@/lib/supabase/database.types";

const ApplySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["company", "individual"]),
  contactName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Which tenant a public supplier application belongs to. This app is
 * multi-tenant-capable, but the public "Join as a Supplier" form (unlike the
 * per-brand website lead webhook) has no brand/secret in its URL to resolve
 * one from — so a deployment with more than one tenant must set
 * SUPPLIER_APPLICATIONS_TENANT_SLUG explicitly; a single-tenant deployment
 * (the common case) needs nothing configured.
 */
async function resolveApplicationTenantId(admin: ReturnType<typeof createAdminClient>): Promise<{ id: string } | null> {
  const slug = process.env.SUPPLIER_APPLICATIONS_TENANT_SLUG;
  if (slug) {
    const { data } = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
    return data ?? null;
  }
  const { data } = await admin.from("tenants").select("id");
  if (!data || data.length !== 1) return null;
  const [tenant] = data;
  return tenant ?? null;
}

/**
 * Public self-service supplier application ("Join as a Supplier"). Unlike
 * createSupplierAction (app/(staff)/suppliers/actions.ts), this is called by
 * an anonymous visitor with no session, so every Supabase call here goes
 * through the admin (service-role) client. The applicant is inserted
 * straight into `suppliers` with status "submitted" — the same state a
 * staff-invited supplier reaches once they submit their own details — so
 * the existing review UI (app/(staff)/suppliers/[id]) needs no changes to
 * show and decide on it.
 *
 * Deliberately does NOT let the applicant set a password here (per product
 * decision) — an auth user is created behind the scenes so `suppliers.id`
 * has something to reference, but no invite link is ever generated or sent
 * at this step. That only happens once staff approve the application (see
 * decideSupplierAction), which is the applicant's first real chance to log
 * in.
 */
export async function applySupplierAction(_prevState: { error: string | null; success: boolean }, formData: FormData) {
  const parsed = ApplySchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "company"),
    contactName: String(formData.get("contactName") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    whatsapp: String(formData.get("whatsapp") ?? "").trim() || undefined,
    region: String(formData.get("region") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a valid business name and email address.", success: false };
  }
  const body = parsed.data;

  const admin = createAdminClient();

  const tenant = await resolveApplicationTenantId(admin);
  if (!tenant) {
    console.error("applySupplierAction: could not resolve a tenant — set SUPPLIER_APPLICATIONS_TENANT_SLUG.");
    return { error: "Applications aren't available right now — please try again later.", success: false };
  }

  const { data: existing } = await admin
    .from("suppliers")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("email", body.email)
    .maybeSingle();
  if (existing) {
    return { error: "An application (or account) already exists for this email address.", success: false };
  }

  // Same generateLink pattern as createSupplierAction, but the link itself
  // is never used — this call only exists to create the underlying auth
  // user for `suppliers.id` to reference.
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: body.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.user) {
    return { error: "Could not submit your application — this email address may already be registered.", success: false };
  }

  const { error: supplierError } = await admin.from("suppliers").insert({
    id: invited.user.id,
    tenant_id: tenant.id,
    name: body.name,
    type: body.type as SupplierType,
    contact_name: body.contactName ?? null,
    email: body.email,
    phone: body.phone ?? null,
    whatsapp: body.whatsapp ?? null,
    region: body.region ?? null,
    notes: body.notes ?? null,
    status: "submitted",
    applied_publicly: true,
  });
  if (supplierError) {
    return { error: supplierError.message, success: false };
  }

  await recordAudit({
    client: admin,
    tenantId: tenant.id,
    actorId: null,
    action: "supplier_applied_publicly",
    entityType: "supplier",
    entityId: invited.user.id,
    newValue: { name: body.name, email: body.email, type: body.type, region: body.region },
  });

  return { error: null, success: true };
}
