"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { ProfileStatus } from "@/lib/supabase/database.types";

async function requireUserManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_USERS);
  if (!allowed) throw new Error("You do not have permission to manage users.");
  return profile;
}

export async function inviteUserAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireUserManager();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "");
  const jobTitle = String(formData.get("jobTitle") ?? "").trim() || null;

  if (!fullName || !email || !roleId) {
    return { error: "Full name, email and role are required." };
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite`,
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Could not send the invite." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    tenant_id: actor.tenant_id,
    full_name: fullName,
    email,
    job_title: jobTitle,
    role_id: roleId,
    default_company_id: actor.default_company_id,
    default_brand_id: actor.default_brand_id,
    status: "invited",
    requires_password_reset: true,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_invited",
    entityType: "profile",
    entityId: invited.user.id,
    newValue: { email, fullName, roleId },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

export async function updateUserStatusAction(userId: string, status: ProfileStatus) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("status, tenant_id, is_master_admin")
    .eq("id", userId)
    .single();

  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }
  if (target.is_master_admin && !actor.is_master_admin) {
    throw new Error("Only a Master Admin can change another Master Admin's status.");
  }

  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_status_changed",
    entityType: "profile",
    entityId: userId,
    previousValue: { status: target.status },
    newValue: { status },
  });

  revalidatePath("/settings/users");
}

export async function updateUserRoleAction(userId: string, roleId: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("role_id, tenant_id")
    .eq("id", userId)
    .single();

  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }

  const { error } = await supabase.from("profiles").update({ role_id: roleId }).eq("id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_role_changed",
    entityType: "profile",
    entityId: userId,
    previousValue: { role_id: target.role_id },
    newValue: { role_id: roleId },
  });

  revalidatePath("/settings/users");
}
