"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateUserStatusAction, updateUserRoleAction } from "./actions";
import type { ProfileStatus } from "@/lib/supabase/database.types";

const STATUS_STYLES: Record<ProfileStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  invited: "bg-blue-50 text-blue-700",
  suspended: "bg-amber-50 text-amber-700",
  disabled: "bg-red-50 text-red-700",
  archived: "bg-slate-100 text-slate-600",
};

export interface UserListRow {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  status: ProfileStatus;
  role_id: string | null;
  is_master_admin: boolean;
  region: string | null;
  brands: { name: string } | null;
}

export function UserRow({
  user,
  roles,
  canManage,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  canManage: boolean;
}) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function changeStatus(status: ProfileStatus) {
    startTransition(async () => {
      try {
        await updateUserStatusAction(user.id, status);
        notify(`${user.full_name} is now ${status}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function changeRole(roleId: string) {
    startTransition(async () => {
      try {
        await updateUserRoleAction(user.id, roleId);
        notify(`Role updated for ${user.full_name}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update role");
      }
    });
  }

  return (
    <tr className="border-t">
      <td className="py-4">
        <b>{user.full_name}</b>
        <div className="text-xs text-slate-400">{user.email}</div>
      </td>
      <td className="text-sm text-slate-600">{user.job_title ?? "—"}</td>
      <td className="text-sm">
        {user.brands?.name ?? <span className="text-red-500">No brand</span>}
      </td>
      <td className="text-sm text-slate-600">{user.region ?? "—"}</td>
      <td>
        {user.is_master_admin ? (
          <span className="text-sm font-bold">Master Admin</span>
        ) : (
          <select
            value={user.role_id ?? ""}
            disabled={!canManage || pending}
            onChange={(e) => changeRole(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </td>
      <td className="text-right">
        {canManage && !user.is_master_admin && (
          <select
            disabled={pending}
            value=""
            onChange={(e) => e.target.value && changeStatus(e.target.value as ProfileStatus)}
            className="rounded-lg border px-2 py-1.5 text-xs font-bold"
          >
            <option value="">Change status…</option>
            <option value="active">Activate</option>
            <option value="suspended">Suspend</option>
            <option value="disabled">Disable</option>
            <option value="archived">Archive</option>
          </select>
        )}
      </td>
    </tr>
  );
}
