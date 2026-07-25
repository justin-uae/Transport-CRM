"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { togglePermissionAction } from "../actions";

interface PermissionItem {
  id: string;
  key: string;
  description: string | null;
}

export function PermissionGrid({
  roleId,
  categories,
  grantedIds,
  readOnly,
}: {
  roleId: string;
  categories: Record<string, PermissionItem[]>;
  grantedIds: Set<string>;
  readOnly: boolean;
}) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function toggle(permissionId: string, enabled: boolean) {
    startTransition(async () => {
      try {
        await togglePermissionAction(roleId, permissionId, enabled);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update permission");
      }
    });
  }

  return (
    <div className="space-y-6">
      {Object.entries(categories).map(([category, perms]) => (
        <div key={category}>
          <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">{category}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {perms.map((perm) => (
              <label
                key={perm.id}
                className="flex items-start gap-3 rounded-xl border p-3 text-sm has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50"
              >
                <input
                  type="checkbox"
                  defaultChecked={grantedIds.has(perm.id)}
                  disabled={readOnly || pending}
                  onChange={(e) => toggle(perm.id, e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold">{perm.key}</div>
                  {perm.description && <div className="text-xs text-slate-500">{perm.description}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
