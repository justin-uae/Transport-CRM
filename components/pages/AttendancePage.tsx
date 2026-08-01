"use client";

import { Clock3, LogIn, Coffee, LogOut } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useAttendance } from "@/components/ui/AttendanceState";
import { teamPerformance } from "@/components/demo/demoData";

const CLOCK_IN_TIMES = ["08:57", "09:02", "08:49", "09:08"];
const ACTIVE_TIMES = ["6h 14m", "6h 03m", "5h 52m", "5h 46m"];

export function AttendancePage() {
  const { clock, cycle } = useAttendance();

  return (
    <div>
      <PageHead
        eyebrow="People Operations"
        title="Time & attendance"
        text="Clock-in records, shifts, breaks, active time and payroll-ready timesheets."
      />
      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <Panel>
          <div className="text-center">
            <div
              className={
                "mx-auto grid h-24 w-24 place-items-center rounded-full " +
                (clock === "Working"
                  ? "bg-emerald-50 text-emerald-600"
                  : clock === "On break"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-slate-100 text-slate-500")
              }
            >
              <Clock3 size={42} />
            </div>
            <h2 className="mt-4 text-2xl font-black">{clock}</h2>
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={cycle}
                disabled={clock !== "Not clocked in"}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <LogIn className="mr-2 inline" size={17} />
                Clock in
              </button>
              <button
                onClick={cycle}
                disabled={clock !== "Working"}
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <Coffee className="mr-2 inline" size={17} />
                Break
              </button>
              <button
                onClick={cycle}
                disabled={clock === "Not clocked in"}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <LogOut className="mr-2 inline" size={17} />
                Clock out
              </button>
            </div>
          </div>
        </Panel>
        <Panel className="min-w-0">
          <SectionTitle title="Today's attendance overview" sub="Live team status" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-3">User</th>
                  <th>Clock in</th>
                  <th>Active time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamPerformance.map((u, i) => (
                  <tr className="border-t" key={u.name}>
                    <td className="whitespace-nowrap py-4 font-bold">{u.name}</td>
                    <td className="whitespace-nowrap">{CLOCK_IN_TIMES[i]!}</td>
                    <td className="whitespace-nowrap">{ACTIVE_TIMES[i]!}</td>
                    <td className="whitespace-nowrap">
                      <span
                        className={
                          "rounded-full px-2 py-1 text-xs font-bold " +
                          (u.status === "Working" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
