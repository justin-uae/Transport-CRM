import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { InviteUserForm } from "./InviteUserForm";
import { UserRow, type UserListRow } from "./UserRow";

export default async function UsersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_USERS);

  const [{ data }, { data: roles }, { data: brands }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, job_title, status, role_id, is_master_admin, region, brands:default_brand_id(name)")
      .order("full_name"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("brands").select("id, name").order("name"),
  ]);
  const users = (data ?? []) as unknown as UserListRow[];

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Users"
        text="Invite, assign roles and manage account status for everyone in your organisation."
        action={canManage ? <InviteUserForm roles={roles ?? []} brands={brands ?? []} /> : undefined}
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">User</th>
                <th>Job title</th>
                <th>Brand</th>
                <th>Region</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} roles={roles ?? []} canManage={canManage} />
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No users yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
