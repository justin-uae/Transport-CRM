import "server-only";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";

interface RecordAuditInput {
  tenantId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * Single write path for the audit_log table. Every mutating Server Action
 * that touches financial, pricing, allocation or user/permission data must
 * call this (Part 42, rule 29 of the project brief) — never insert into
 * audit_log directly from elsewhere.
 */
export async function recordAudit(input: RecordAuditInput) {
  const supabase = await createClient();
  const headerList = await headers();

  await supabase.from("audit_log").insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    previous_value: input.previousValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    ip_address: headerList.get("x-forwarded-for"),
    user_agent: headerList.get("user-agent"),
  });
}
