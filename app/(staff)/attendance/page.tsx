import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEventsSince, daysAgoIso, startOfTodayIso } from "@/lib/attendance";
import { deriveAttendanceState, computeActiveMs } from "@/lib/attendanceState";
import { AttendancePage, type DailySummary, type TeamRow } from "@/components/pages/AttendancePage";
import type { AttendanceEventType } from "@/lib/supabase/database.types";

const RECENT_DAYS = 14;

export default async function AttendanceRoutePage() {
  const profile = await requireProfile();
  const canViewTeam = await hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS);
  const supabase = await createClient();

  const [ownRecentEvents, teamEventsResult, teamProfilesResult] = await Promise.all([
    getEventsSince(supabase, profile.id, daysAgoIso(RECENT_DAYS)),
    canViewTeam
      ? supabase.from("attendance_events").select("user_id, event, created_at").gte("created_at", startOfTodayIso()).order("created_at", { ascending: true })
      : Promise.resolve({ data: null }),
    canViewTeam ? supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: null }),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const eventsByDay = new Map<string, { event: AttendanceEventType; created_at: string }[]>();
  for (const e of ownRecentEvents) {
    const day = e.created_at.slice(0, 10);
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(e);
  }

  const recentDays: DailySummary[] = [...eventsByDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, events]) => {
      const state = deriveAttendanceState(events);
      const isToday = date === todayStr;
      // A past day with no clock_out means it was forgotten, not that the
      // shift is still running — showing "—" beats fabricating a duration
      // against the current moment (projectContext.md §133's corrections
      // workflow is the deferred, proper fix for that case).
      const activeMs =
        state.status === "clocked_out"
          ? computeActiveMs(state, new Date(state.clockOutAt!).getTime())
          : isToday
            ? computeActiveMs(state, Date.now())
            : null;
      return { date, clockInAt: state.clockInAt, clockOutAt: state.clockOutAt, activeMs };
    });

  let teamRows: TeamRow[] | null = null;
  if (canViewTeam && teamProfilesResult.data) {
    const eventsByUser = new Map<string, { event: AttendanceEventType; created_at: string }[]>();
    for (const e of (teamEventsResult.data ?? []) as { user_id: string; event: AttendanceEventType; created_at: string }[]) {
      if (!eventsByUser.has(e.user_id)) eventsByUser.set(e.user_id, []);
      eventsByUser.get(e.user_id)!.push(e);
    }
    teamRows = teamProfilesResult.data.map((p) => {
      const state = deriveAttendanceState(eventsByUser.get(p.id) ?? []);
      return {
        profileId: p.id,
        name: p.full_name,
        status: state.status,
        clockInAt: state.clockInAt,
        activeMs: computeActiveMs(state, Date.now()),
      };
    });
  }

  return <AttendancePage recentDays={recentDays} teamRows={teamRows} />;
}
