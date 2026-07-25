"use client";

import { createContext, useContext, useState } from "react";
import { useToast } from "./Toast";

type ClockState = "Not clocked in" | "Working" | "On break";

const AttendanceContext = createContext<{
  clock: ClockState;
  cycle: () => void;
} | null>(null);

/**
 * Demo-only clock state shared between the header and the Attendance page.
 * Not persisted — real clock-in/out (Part 19) lands with the Attendance
 * module's backend in a later phase.
 */
export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const [clock, setClock] = useState<ClockState>("Not clocked in");
  const notify = useToast();

  function cycle() {
    const next: ClockState =
      clock === "Not clocked in" ? "Working" : clock === "Working" ? "On break" : "Not clocked in";
    setClock(next);
    notify(
      next === "Working"
        ? "Clocked in successfully"
        : next === "On break"
          ? "Break started"
          : "Clocked out successfully",
    );
  }

  return (
    <AttendanceContext.Provider value={{ clock, cycle }}>{children}</AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error("useAttendance must be used within AttendanceProvider");
  return ctx;
}
