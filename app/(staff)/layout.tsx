import { requireProfile } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { StaffShell } from "@/components/layout/StaffShell";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: role }, { brands, activeBrandId }] = await Promise.all([
    profile.role_id
      ? supabase.from("roles").select("name").eq("id", profile.role_id).single()
      : Promise.resolve({ data: null }),
    getBrandContext(profile),
  ]);

  return (
    <StaffShell
      userName={profile.full_name}
      roleName={profile.is_master_admin ? "Master Admin" : (role?.name ?? "Team Member")}
      brands={brands}
      activeBrandId={activeBrandId}
    >
      {children}
    </StaffShell>
  );
}
