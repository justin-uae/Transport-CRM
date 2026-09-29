import { Bot } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";

export interface LeadAssignmentEvent {
  id: string;
  action: string;
  created_at: string;
  new_value: { assignedToName?: string; quoteNumber?: string } | null;
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
    case "ai_quote_created_sla":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically — it sat unquoted past the AI Assistant's time limit`;
    case "ai_quote_created_whatsapp_lead":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically the moment this WhatsApp lead was captured`;
    case "ai_quote_created_manual_assign":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically — ${actor} assigned this lead to it`;
    default:
      return `${actor} updated this lead's ownership`;
  }
}

/** Small tag distinguishing what kind of event this was, at a glance —
    "AI · <trigger>" for anything the AI Assistant did on its own, "Manual"
    for a human claim/assign/release. Kept as three sub-labels rather than
    one generic "AI" badge so the timeline actually tells the three AI
    triggers (SLA time limit, WhatsApp lead, manual assign) apart. */
function Badge({ action }: { action: string }) {
  if (action === "ai_quote_created_sla" || action === "lead_released_sla_breach") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
        <Bot size={11} /> AI · Time limit
      </span>
    );
  }
  if (action === "ai_quote_created_whatsapp_lead") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
        <Bot size={11} /> AI · WhatsApp lead
      </span>
    );
  }
  if (action === "ai_quote_created_manual_assign") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
        <Bot size={11} /> AI · Assigned to AI
      </span>
    );
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Manual</span>;
}

/**
 * Who assigned/reassigned/claimed/released this lead, and when — plus every
 * time AI Assistant priced and sent a quote for it on its own (SLA time
 * limit, an instant WhatsApp lead, or being explicitly assigned to the AI
 * role), each tagged with its own badge so the three triggers read
 * distinctly instead of one generic "AI did something" line. Separate from
 * LeadEditHistory (field-level content edits, lead_edits table) since this
 * reads audit_log instead (assignLeadAction/claimLeadAction/
 * releaseLeadAction/lib/aiAutoQuote.ts all call recordAudit against
 * entity_type = 'lead'). Only fetched for, and only visible to, someone
 * holding admin.view_audit_logs (Master Admin, Sales Manager) — audit_log's
 * own select policy is gated on that permission tenant-wide, not something
 * this component can widen.
 */
export function LeadAssignmentHistory({ events }: { events: LeadAssignmentEvent[] }) {
  if (events.length === 0) return null;

  return (
    <Panel>
      <SectionTitle title="Assignment history" sub="Who this lead has been assigned, claimed or released by, and when — including anything AI Assistant did on its own" />
      <ol className="mt-4 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border p-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <Badge action={e.action} />
              <span>{describe(e)}</span>
            </span>
            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
