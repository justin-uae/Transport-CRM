"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

async function requireRoleManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_ROLES);
  if (!allowed) throw new Error("You do not have permission to manage roles.");
  return profile;
}

export async function createRoleAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireRoleManager();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { error: "Role name is required." };

  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("roles")
    .insert({ tenant_id: actor.tenant_id, name, description, is_system: false })
    .select()
    .single();

  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "role_created",
    entityType: "role",
    entityId: role.id,
    newValue: { name },
  });

  revalidatePath("/settings/roles");
  return { error: null };
}

export async function togglePermissionAction(roleId: string, permissionId: string, enabled: boolean) {
  const actor = await requireRoleManager();
  const supabase = await createClient();

  const { data: role } = await supabase.from("roles").select("tenant_id, name").eq("id", roleId).single();
  if (!role || role.tenant_id !== actor.tenant_id) throw new Error("Role not found.");

  if (enabled) {
    const { error } = await supabase.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .eq("permission_id", permissionId);
    if (error) throw new Error(error.message);
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: enabled ? "permission_granted" : "permission_revoked",
    entityType: "role",
    entityId: roleId,
    newValue: { permission_id: permissionId, enabled },
  });

  revalidatePath(`/settings/roles/${roleId}`);
}
