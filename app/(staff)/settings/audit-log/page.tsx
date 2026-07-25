import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default async function AuditLogPage() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS);

  if (!allowed) {
    return (
      <div>
        <PageHead eyebrow="Administration" title="Audit Log" />
        <Panel>
          <p className="py-8 text-center text-sm text-slate-500">
            You do not have permission to view the audit log.
          </p>
        </Panel>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, reason, created_at, actor:profiles!audit_log_actor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Audit Log"
        text="Every financial, pricing, allocation and user change — append-only, most recent first."
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="whitespace-nowrap py-3 text-slate-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="font-semibold">
                    {(entry.actor as unknown as { full_name: string } | null)?.full_name ?? "System"}
                  </td>
                  <td>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{entry.action}</span>
                  </td>
                  <td className="text-slate-500">
                    {entry.entity_type}
                    {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(entries ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No audit entries yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
