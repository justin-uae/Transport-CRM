import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";

export interface LeadAssignmentEvent {
  id: string;
  action: string;
  created_at: string;
  new_value: { assignedToName?: string } | null;
  actor: { full_name: string } | null;
}

function describe(e: LeadAssignmentEvent): string {
  const actor = e.actor?.full_name ?? "Someone";
  switch (e.action) {
    case "lead_assigned_by_manager":
      return `${actor} assigned this lead to ${e.new_value?.assignedToName ?? "a sales user"}`;
    case "lead_claimed":
      return `${actor} claimed this lead from the open pool`;
    case "lead_released":
      return `${actor} released this lead back to the open pool`;
    case "lead_released_sla_breach":
      return "Automatically released back to the open pool — it sat unquoted past the AI Assistant's time limit";
    default:
      return `${actor} updated this lead's ownership`;
  }
}

/**
 * Who assigned/reassigned/claimed/released this lead, and when — separate
 * from LeadEditHistory (field-level content edits, lead_edits table) since
 * this reads audit_log instead (assignLeadAction/claimLeadAction/
 * releaseLeadAction all call recordAudit). Only fetched for, and only
 * visible to, someone holding admin.view_audit_logs (Master Admin, Sales
 * Manager) — audit_log's own select policy is gated on that permission
 * tenant-wide, not something this component can widen.
 */
export function LeadAssignmentHistory({ events }: { events: LeadAssignmentEvent[] }) {
  if (events.length === 0) return null;

  return (
    <Panel>
      <SectionTitle title="Assignment history" sub="Who this lead has been assigned, claimed or released by, and when" />
      <ol className="mt-4 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border p-3 text-sm">
            <span>{describe(e)}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
