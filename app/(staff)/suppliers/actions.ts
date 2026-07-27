"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { SupplierType } from "@/lib/supabase/database.types";

export async function createSupplierAction(
  _prevState: { error: string | null; link: string | null },
  formData: FormData,
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_ADD);
  if (!allowed) return { error: "You do not have permission to add suppliers.", link: null };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const type = (String(formData.get("type") ?? "company") as SupplierType) ?? "company";
  const contactName = String(formData.get("contactName") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const whatsapp = String(formData.get("whatsapp") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !email) {
    return { error: "Supplier name and email are required.", link: null };
  }

  const admin = createAdminClient();

  // Same generateLink pattern as the staff invite flow (settings/users/actions.ts)
  // — creates the auth user without a Supabase-hosted email, we build the
  // /auth/confirm link ourselves and hand it back to copy/share directly.
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Could not create the invite.", link: null };
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
    return { error: supplierError.message, link: null };
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

  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?token_hash=${invited.properties.hashed_token}&type=invite&next=/accept-invite`;
  return { error: null, link: inviteLink };
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
