import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { InviteUserForm } from "./InviteUserForm";
import { UserRow, type UserListRow } from "./UserRow";

const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_USERS);

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let usersQuery = supabase
    .from("profiles")
    .select(
      "id, full_name, email, job_title, status, role_id, is_master_admin, brands:default_brand_id(name), user_regions(id, region)",
      { count: "exact" },
    );
  if (q) {
    usersQuery = usersQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const [{ data, count }, { data: roles }, { data: brands }] = await Promise.all([
    usersQuery.order("full_name").range(from, to),
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
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search users by name or email…" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
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
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Panel>
    </div>
  );
}
