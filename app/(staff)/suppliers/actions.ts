"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import type { SupplierType } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

function buildInviteLink(hashedToken: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?token_hash=${hashedToken}&type=invite&next=/accept-invite`;
}

/** Sends (or resends) the branded supplier-invite email — errors are returned, not swallowed, so both call sites can tell the admin whether it actually went out (the link is still handed back either way, as a copy/paste fallback). */
async function sendSupplierInviteEmail(
  admin: AdminClient,
  input: { tenantId: string; supplierName: string; email: string; link: string },
) {
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", input.tenantId).maybeSingle();
  return renderAndSendTemplate(admin, {
    tenantId: input.tenantId,
    key: "supplier_invited",
    to: input.email,
    variables: { supplier_name: input.supplierName, brand_name: tenant?.name ?? "", link: input.link },
  });
}

export async function createSupplierAction(
  _prevState: { error: string | null; link: string | null; emailError: string | null },
  formData: FormData,
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_ADD);
  if (!allowed) return { error: "You do not have permission to add suppliers.", link: null, emailError: null };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const type = (String(formData.get("type") ?? "company") as SupplierType) ?? "company";
  const contactName = String(formData.get("contactName") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const whatsapp = String(formData.get("whatsapp") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !email) {
    return { error: "Supplier name and email are required.", link: null, emailError: null };
  }

  const admin = createAdminClient();

  // Same generateLink pattern as the staff invite flow (settings/users/actions.ts)
  // — creates the auth user without Supabase's own hosted email, we build
  // the /auth/confirm link ourselves and send it through this app's own
  // branded template via sendSupplierInviteEmail below (still handed back
  // as `link` too, for a copy/paste fallback if the email fails to send).
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Could not create the invite.", link: null, emailError: null };
  }

  const { error: supplierError } = await admin.from("suppliers").insert({
    id: invited.user.id,
    tenant_id: actor.tenant_id,
    name,
    type,
    contact_name: contactName,
    email,
    phone,
    whatsapp,
    region,
    notes,
    status: "invited",
    created_by: actor.id,
  });

  if (supplierError) {
    return { error: supplierError.message, link: null, emailError: null };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_invited",
    entityType: "supplier",
    entityId: invited.user.id,
    newValue: { name, email, type, region },
  });

  revalidatePath("/suppliers");

  const inviteLink = buildInviteLink(invited.properties.hashed_token);
  const { error: emailError } = await sendSupplierInviteEmail(admin, {
    tenantId: actor.tenant_id,
    supplierName: name,
    email,
    link: inviteLink,
  });

  return { error: null, link: inviteLink, emailError };
}

/** Re-sends the branded invite email to a supplier who hasn't accepted yet, with a fresh link (the original token may have expired). */
export async function resendSupplierInviteAction(supplierId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_ADD);
  if (!allowed) return { error: "You do not have permission to manage suppliers.", link: null };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("suppliers")
    .select("tenant_id, name, email, status")
    .eq("id", supplierId)
    .single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "Supplier not found.", link: null };
  }
  if (target.status !== "invited") {
    return { error: "This supplier has already accepted their invite.", link: null };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: target.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.properties) {
    return { error: inviteError?.message ?? "Could not generate a new invite link.", link: null };
  }

  const inviteLink = buildInviteLink(invited.properties.hashed_token);
  const { error: emailError } = await sendSupplierInviteEmail(admin, {
    tenantId: actor.tenant_id,
    supplierName: target.name,
    email: target.email,
    link: inviteLink,
  });

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_invite_resent",
    entityType: "supplier",
    entityId: supplierId,
    newValue: { email: target.email },
  });

  return { error: emailError, link: inviteLink };
}

export async function decideSupplierAction(supplierId: string, decision: "approved" | "rejected") {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_APPROVE);
  if (!allowed) throw new Error("You do not have permission to approve suppliers.");

  const supabase = await createClient();
  const { data: supplier } = await supabase.from("suppliers").select("status, tenant_id").eq("id", supplierId).single();
  if (!supplier || supplier.tenant_id !== actor.tenant_id) throw new Error("Supplier not found.");

  const { error } = await supabase
    .from("suppliers")
    .update({ status: decision, approved_by: actor.id, approved_at: new Date().toISOString() })
    .eq("id", supplierId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: decision === "approved" ? "supplier_approved" : "supplier_rejected",
    entityType: "supplier",
    entityId: supplierId,
    previousValue: { status: supplier.status },
    newValue: { status: decision },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
}
