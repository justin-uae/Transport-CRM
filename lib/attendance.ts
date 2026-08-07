import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceEventLike } from "@/lib/attendanceState";
import type { Database } from "@/lib/supabase/database.types";

export * from "@/lib/attendanceState";

/** UTC-midnight day boundary — per-user shift timezones are deferred (projectContext.md §129), so "today" is a UTC calendar day for now. */
export function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function daysAgoIso(days: number): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString();
}

/** This user's own attendance_events from `sinceIso` onward, oldest first. */
export async function getEventsSince(
  supabase: SupabaseClient<Database>,
  userId: string,
  sinceIso: string,
): Promise<AttendanceEventLike[]> {
  const { data } = await supabase
    .from("attendance_events")
    .select("event, created_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  return data ?? [];
}
