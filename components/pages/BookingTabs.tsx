"use client";

import Link from "next/link";

const TABS = [
  { key: "confirmed", href: "/bookings", label: "Confirmed" },
  { key: "lost", href: "/bookings/lost", label: "Lost" },
  { key: "completed", href: "/bookings/completed", label: "Completed" },
] as const;

export function BookingTabs({ active }: { active: "confirmed" | "lost" | "completed" }) {
  return (
    <div className="mb-5 flex gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            "rounded-xl px-3 py-2 text-sm font-bold " +
            (t.key === active ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
