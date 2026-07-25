"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, Settings, X } from "lucide-react";
import clsx from "clsx";
import { NAV } from "./nav";

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  userName,
  roleName,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName: string;
  roleName: string;
}) {
  const pathname = usePathname();
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-white shadow-2xl transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-500">
              <Bus size={22} />
            </div>
            <div>
              <b className="text-lg">Global Transport</b>
              <div className="text-[10px] uppercase tracking-[.22em] text-primary-300">
                Enterprise CRM
              </div>
            </div>
          </div>
          <button className="lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">
            Workspace
          </div>
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                className={clsx(
                  "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                  active
                    ? "bg-primary-500 font-semibold text-white shadow-lg shadow-orange-950/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
        <div className="border-t border-white/10 p-4">
          <Link
            href="/settings"
            onClick={onCloseMobile}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"
          >
            <Settings size={18} />
            Settings
          </Link>
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-500 font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{userName}</div>
              <div className="text-xs text-slate-400">{roleName}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
