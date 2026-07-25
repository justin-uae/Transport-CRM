import { requireProfile } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand";
import { getGrantedPermissions } from "@/lib/permissions";
import { ADMIN_SURFACE_PERMISSIONS } from "@/lib/permissionKeys";
import { createClient } from "@/lib/supabase/server";
import { StaffShell } from "@/components/layout/StaffShell";
import { NAV } from "@/components/layout/nav";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: role }, { brands, activeBrandId }, granted] = await Promise.all([
    profile.role_id
      ? supabase.from("roles").select("name").eq("id", profile.role_id).single()
      : Promise.resolve({ data: null }),
    getBrandContext(profile),
    getGrantedPermissions(profile),
  ]);

  // Icon components in NAV can't cross the server->client prop boundary
  // (RSC can only serialize data, not function/component references) — so
  // we compute which hrefs are visible here and let the Client Component
  // Sidebar filter its own client-side NAV import by that list.
  const visibleHrefs = NAV.filter((item) => !item.anyOf || item.anyOf.some((key) => granted.has(key))).map(
    (item) => item.href,
  );
  const canSeeSettings = ADMIN_SURFACE_PERMISSIONS.some((key) => granted.has(key));

  return (
    <StaffShell
      userName={profile.full_name}
      roleName={profile.is_master_admin ? "Master Admin" : (role?.name ?? "Team Member")}
      brands={brands}
      activeBrandId={activeBrandId}
      visibleHrefs={visibleHrefs}
      canSeeSettings={canSeeSettings}
    >
      {children}
    </StaffShell>
  );
}
