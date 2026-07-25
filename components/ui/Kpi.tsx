import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Panel } from "./Panel";
import clsx from "clsx";

export function Kpi({
  title,
  value,
  delta,
  icon: Icon,
  warn = false,
}: {
  title: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  warn?: boolean;
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <div
          className={clsx(
            "grid h-11 w-11 place-items-center rounded-2xl",
            warn ? "bg-amber-50 text-amber-600" : "bg-primary-50 text-primary-600",
          )}
        >
          <Icon size={21} />
        </div>
        <MoreHorizontal className="text-slate-300" size={18} />
      </div>
      <div className="mt-5 text-sm font-semibold text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {delta && (
        <div className={clsx("mt-2 text-xs font-bold", warn ? "text-amber-600" : "text-emerald-600")}>
          {delta}
        </div>
      )}
    </Panel>
  );
}
