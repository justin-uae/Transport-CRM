"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  updateUserStatusAction,
  updateUserRoleAction,
  addUserRegionAction,
  removeUserRegionAction,
  resendUserInviteAction,
} from "./actions";
import { MailboxBadge, type EmailAccountStatus } from "./EmailAccountForm";
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

/**
 * All the state + server-action calls a user row needs, shared between the
 * desktop `<tr>` (UserRow) and the mobile card (UserCard) — each renders its
 * own markup, but neither duplicates the mutation logic.
 */
function useUserRowActions(user: UserListRow) {
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

  function resendInvite() {
    startTransition(async () => {
      const result = await resendUserInviteAction(user.id);
      if (result.error) {
        notify(`Could not send the invite email (${result.error}) — link: ${result.link ?? "none"}`);
        return;
      }
      notify(`Invite email resent to ${user.email}`);
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

  return { pending, regionInput, setRegionInput, addingRegion, setAddingRegion, addRegion, removeRegion, changeStatus, changeRole, resendInvite };
}

/**
 * Region pills + inline add/remove — pulled out so the desktop table cell
 * and the mobile card render the exact same (fixed) markup instead of two
 * copies that could drift out of sync. `min-w-0` on both the cell wrapper
 * and the flex row is what actually makes the pills wrap instead of
 * overflowing past the column and overlapping the next one — flex items
 * (and table cells) default to `min-width: auto`, which refuses to shrink
 * below the content's natural width unless told otherwise.
 */
function RegionEditor({
  user,
  canManage,
  pending,
  regionInput,
  setRegionInput,
  addingRegion,
  setAddingRegion,
  addRegion,
  removeRegion,
}: {
  user: UserListRow;
  canManage: boolean;
  pending: boolean;
  regionInput: string;
  setRegionInput: (v: string) => void;
  addingRegion: boolean;
  setAddingRegion: (v: boolean) => void;
  addRegion: () => void;
  removeRegion: (regionId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {user.user_regions.map((r) => (
        <span
          key={r.id}
          className="flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
        >
          <span className="truncate">{r.region}</span>
          {canManage && (
            <button
              type="button"
              disabled={pending}
              onClick={() => removeRegion(r.id)}
              className="shrink-0 rounded-full hover:bg-slate-200 disabled:opacity-60"
              aria-label={`Remove ${r.region}`}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {user.user_regions.length === 0 && !addingRegion && <span className="text-slate-400">—</span>}
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
            className="w-24 shrink-0 rounded-lg border px-1.5 py-0.5 text-xs outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setAddingRegion(true)}
            className="shrink-0 rounded-full border border-dashed border-slate-300 p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-60"
            aria-label="Add region"
          >
            <Plus size={10} />
          </button>
        ))}
    </div>
  );
}

/** Desktop table row — shown at `sm:` and above (see UsersPage). */
export function UserRow({
  user,
  roles,
  canManage,
  mailbox,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  canManage: boolean;
  mailbox: EmailAccountStatus | null;
}) {
  const a = useUserRowActions(user);

  return (
    <tr className="border-t">
      <td className="px-3 py-4 align-top">
        <b className="block break-words">{user.full_name}</b>
        <div className="break-words text-xs text-slate-400">{user.email}</div>
      </td>
      <td className="hidden break-words px-3 py-4 align-top text-sm text-slate-600 md:table-cell">{user.job_title ?? "—"}</td>
      <td className="break-words px-3 py-4 align-top text-sm">
        {user.brands?.name ?? <span className="text-red-500">No brand</span>}
      </td>
      <td className="min-w-0 px-3 py-4 align-top text-sm text-slate-600">
        <RegionEditor user={user} canManage={canManage} {...a} />
      </td>
      <td className="px-3 py-4 align-top">
        {user.is_master_admin ? (
          <span className="text-sm font-bold">Master Admin</span>
        ) : (
          <select
            value={user.role_id ?? ""}
            disabled={!canManage || a.pending}
            onChange={(e) => a.changeRole(e.target.value)}
            className="w-full rounded-lg border px-2 py-1.5 text-sm"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-3 py-4 align-top">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </td>
      <td className="hidden px-3 py-4 align-top md:table-cell">
        <MailboxBadge userId={user.id} userName={user.full_name} account={mailbox} canManage={canManage} />
      </td>
      <td className="px-3 py-4 align-top text-right">
        <div className="flex flex-col items-end gap-2">
          {canManage && user.status === "invited" && (
            <button
              type="button"
              disabled={a.pending}
              onClick={a.resendInvite}
              className="w-full rounded-lg border px-2 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Resend invite
            </button>
          )}
          {canManage && !user.is_master_admin && (
            <select
              disabled={a.pending}
              value=""
              onChange={(e) => e.target.value && a.changeStatus(e.target.value as ProfileStatus)}
              className="w-full rounded-lg border px-2 py-1.5 text-xs font-bold"
            >
              <option value="">Change status…</option>
              <option value="active">Activate</option>
              <option value="suspended">Suspend</option>
              <option value="disabled">Disable</option>
              <option value="archived">Archive</option>
            </select>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Mobile card — shown below `sm:` instead of the table (see UsersPage). */
export function UserCard({
  user,
  roles,
  canManage,
  mailbox,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  canManage: boolean;
  mailbox: EmailAccountStatus | null;
}) {
  const a = useUserRowActions(user);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{user.full_name}</div>
          <div className="truncate text-xs text-slate-400">{user.email}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-500">
        <div>
          <div className="font-bold uppercase tracking-wide text-slate-400">Job title</div>
          <div className="mt-0.5 text-slate-700">{user.job_title ?? "—"}</div>
        </div>
        <div>
          <div className="font-bold uppercase tracking-wide text-slate-400">Brand</div>
          <div className="mt-0.5 text-slate-700">{user.brands?.name ?? <span className="text-red-500">No brand</span>}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Region</div>
        <div className="mt-1">
          <RegionEditor user={user} canManage={canManage} {...a} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {user.is_master_admin ? (
          <span className="text-sm font-bold">Master Admin</span>
        ) : (
          <select
            value={user.role_id ?? ""}
            disabled={!canManage || a.pending}
            onChange={(e) => a.changeRole(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <MailboxBadge userId={user.id} userName={user.full_name} account={mailbox} canManage={canManage} />
      </div>

      {canManage && (user.status === "invited" || !user.is_master_admin) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {user.status === "invited" && (
            <button
              type="button"
              disabled={a.pending}
              onClick={a.resendInvite}
              className="rounded-lg border px-2 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Resend invite
            </button>
          )}
          {!user.is_master_admin && (
            <select
              disabled={a.pending}
              value=""
              onChange={(e) => e.target.value && a.changeStatus(e.target.value as ProfileStatus)}
              className="rounded-lg border px-2 py-1.5 text-xs font-bold"
            >
              <option value="">Change status…</option>
              <option value="active">Activate</option>
              <option value="suspended">Suspend</option>
              <option value="disabled">Disable</option>
              <option value="archived">Archive</option>
            </select>
          )}
        </div>
      )}
    </div>
  );
}
