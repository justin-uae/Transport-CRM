"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { deriveAttendanceState, legalNextEvents, getEventsSince, startOfTodayIso } from "@/lib/attendance";
import type { AttendanceEventType } from "@/lib/supabase/database.types";

const ACTION_LABEL: Record<AttendanceEventType, string> = {
  clock_in: "clocked in",
  break_start: "started a break",
  break_end: "ended their break",
  clock_out: "clocked out",
};

async function recordEvent(event: AttendanceEventType) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const todaysEvents = await getEventsSince(supabase, actor.id, startOfTodayIso());
  const state = deriveAttendanceState(todaysEvents);
  if (!legalNextEvents(state.status).includes(event)) {
    throw new Error(`You can't do that right now (current status: ${state.status.replaceAll("_", " ")}).`);
  }

  const { error } = await supabase.from("attendance_events").insert({
    tenant_id: actor.tenant_id,
    user_id: actor.id,
    event,
  });
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "attendance_event",
    entityType: "attendance",
    entityId: actor.id,
    newValue: { event, label: ACTION_LABEL[event] },
  });

  revalidatePath("/attendance");
}

export async function clockInAction() {
  await recordEvent("clock_in");
}

export async function startBreakAction() {
  await recordEvent("break_start");
}

export async function endBreakAction() {
  await recordEvent("break_end");
}

export async function clockOutAction() {
  await recordEvent("clock_out");
}
