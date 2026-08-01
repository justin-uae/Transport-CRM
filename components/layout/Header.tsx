"use client";

import Link from "next/link";
import { Bell, Clock3, FileText, Menu, Plus, Search, LogOut } from "lucide-react";
import clsx from "clsx";
import type { Brand } from "@/lib/supabase/database.types";
import { BrandSwitcher } from "./BrandSwitcher";
import { useAttendance } from "../ui/AttendanceState";
import { signOut } from "@/app/(staff)/actions";

export function Header({
  onOpenMobile,
  brands,
  activeBrandId,
  canCreateQuote,
  canAddLead,
}: {
  onOpenMobile: () => void;
  brands: Brand[];
  activeBrandId: string | null;
  canCreateQuote: boolean;
  canAddLead: boolean;
}) {
  const { clock, cycle } = useAttendance();

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
      <button
        onClick={onOpenMobile}
        className="rounded-xl p-2 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu />
      </button>
      <div className="relative hidden max-w-xl flex-1 md:block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          placeholder="Search leads, bookings, customers or invoices…"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
        <button
          onClick={cycle}
          className={clsx(
            "hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:flex",
            clock === "Working"
              ? "bg-emerald-50 text-emerald-700"
              : clock === "On break"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600",
          )}
        >
          <Clock3 size={16} />
          {clock}
        </button>
        <button
          className="relative rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50"
          aria-label="Notifications"
        >
          <Bell size={19} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary-500" />
        </button>
        {canCreateQuote && (
          <Link
            href="/quotes/new"
            className="hidden items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 md:flex"
          >
            <FileText size={18} />
            New Quote
          </Link>
        )}
        {canAddLead && (
          <Link
            href="/leads/new"
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-primary-600"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">New Lead</span>
          </Link>
        )}
        <form action={signOut}>
          <button
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
