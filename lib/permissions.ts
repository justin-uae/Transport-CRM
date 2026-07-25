import "server-only";
import { createClient } from "./supabase/server";
import type { Profile } from "./supabase/database.types";

export { PERMISSIONS, ADMIN_SURFACE_PERMISSIONS, type PermissionKey } from "./permissionKeys";
import { PERMISSIONS, type PermissionKey } from "./permissionKeys";

/**
 * Checks a single permission for the current session via the database
 * `has_permission()` function (role grant minus/plus per-user overrides).
 * Master Admins always pass without a round trip.
 */
export async function hasPermission(
  profile: Profile,
  key: PermissionKey,
): Promise<boolean> {
  if (profile.is_master_admin) return true;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    permission_key: key,
  });

  if (error) return false;
  return Boolean(data);
}

/**
 * Every permission key currently granted to the signed-in user — role
 * grants plus/minus per-user overrides, mirroring has_permission()'s SQL in
 * a single round trip instead of one RPC call per key. Used to filter the
 * sidebar and gate whole route groups (e.g. /settings) without N+1 checks.
 */
export async function getGrantedPermissions(profile: Profile): Promise<Set<PermissionKey>> {
  if (profile.is_master_admin) return new Set(Object.values(PERMISSIONS));

  const supabase = await createClient();
  const [{ data: roleGrants }, { data: overrides }] = await Promise.all([
    profile.role_id
      ? supabase.from("role_permissions").select("permissions(key)").eq("role_id", profile.role_id)
      : Promise.resolve({ data: [] as { permissions: { key: string } | null }[] }),
    supabase.from("user_permission_overrides").select("effect, permissions(key)").eq("user_id", profile.id),
  ]);

  const granted = new Set<string>();
  for (const row of roleGrants ?? []) {
    const key = (row.permissions as unknown as { key: string } | null)?.key;
    if (key) granted.add(key);
  }
  for (const row of overrides ?? []) {
    const key = (row.permissions as unknown as { key: string } | null)?.key;
    if (!key) continue;
    if (row.effect === "grant") granted.add(key);
    else granted.delete(key);
  }

  return granted as Set<PermissionKey>;
}
