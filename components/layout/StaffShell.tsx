"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ToastProvider } from "../ui/Toast";
import { AttendanceProvider } from "../ui/AttendanceState";
import type { Brand } from "@/lib/supabase/database.types";

export function StaffShell({
  userName,
  roleName,
  brands,
  activeBrandId,
  visibleHrefs,
  canSeeSettings,
  children,
}: {
  userName: string;
  roleName: string;
  brands: Brand[];
  activeBrandId: string | null;
  visibleHrefs: string[];
  canSeeSettings: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <AttendanceProvider>
        <div className="min-h-screen bg-appbg text-slate-800">
          <Sidebar
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            userName={userName}
            roleName={roleName}
            visibleHrefs={visibleHrefs}
            canSeeSettings={canSeeSettings}
          />
          <main className="lg:pl-72">
            <Header
              onOpenMobile={() => setMobileOpen(true)}
              brands={brands}
              activeBrandId={activeBrandId}
            />
            <div className="p-4 md:p-6 xl:p-8">{children}</div>
          </main>
        </div>
      </AttendanceProvider>
    </ToastProvider>
  );
}
