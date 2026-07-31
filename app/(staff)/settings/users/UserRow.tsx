"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  updateUserStatusAction,
  updateUserRoleAction,
  addUserRegionAction,
  removeUserRegionAction,
} from "./actions";
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
  brands: { name: string } | null;
  user_regions: { id: string; region: string }[];
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
  const [regionInput, setRegionInput] = useState("");
  const [addingRegion, setAddingRegion] = useState(false);

  function addRegion() {
    const value = regionInput.trim();
    if (!value) {
      setAddingRegion(false);
      return;
    }
    startTransition(async () => {
      const result = await addUserRegionAction(user.id, value);
      if (result?.error) {
        notify(result.error);
        return;
      }
      setRegionInput("");
      setAddingRegion(false);
      notify(`Region added for ${user.full_name}`);
    });
  }

  function removeRegion(regionId: string) {
    startTransition(async () => {
      try {
        await removeUserRegionAction(user.id, regionId);
        notify(`Region removed for ${user.full_name}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not remove region");
      }
    });
  }

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
      <td className="whitespace-nowrap py-4">
        <b>{user.full_name}</b>
        <div className="text-xs text-slate-400">{user.email}</div>
      </td>
      <td className="whitespace-nowrap text-sm text-slate-600">{user.job_title ?? "—"}</td>
      <td className="whitespace-nowrap text-sm">
        {user.brands?.name ?? <span className="text-red-500">No brand</span>}
      </td>
      <td className="max-w-[220px] text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-1">
          {user.user_regions.map((r) => (
            <span
              key={r.id}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
            >
              {r.region}
              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removeRegion(r.id)}
                  className="rounded-full hover:bg-slate-200 disabled:opacity-60"
                  aria-label={`Remove ${r.region}`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {user.user_regions.length === 0 && !addingRegion && <span>—</span>}
          {canManage &&
            (addingRegion ? (
              <input
                autoFocus
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRegion();
                  }
                  if (e.key === "Escape") {
                    setAddingRegion(false);
                    setRegionInput("");
                  }
                }}
                onBlur={addRegion}
                placeholder="Region name"
                className="w-24 rounded-lg border px-1.5 py-0.5 text-xs outline-none"
              />
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setAddingRegion(true)}
                className="rounded-full border border-dashed border-slate-300 p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-60"
                aria-label="Add region"
              >
                <Plus size={10} />
              </button>
            ))}
        </div>
      </td>
      <td className="whitespace-nowrap">
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
      <td className="whitespace-nowrap">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </td>
      <td className="whitespace-nowrap text-right">
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
