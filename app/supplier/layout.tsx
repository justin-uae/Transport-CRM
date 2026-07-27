import Link from "next/link";
import { Bus, LayoutDashboard, ShieldCheck, LogOut } from "lucide-react";
import { requireSupplier } from "@/lib/auth";
import { signOut } from "@/app/(staff)/actions";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const supplier = await requireSupplier();

  return (
    <div className="min-h-screen bg-appbg text-slate-800">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-500 text-white">
            <Bus size={20} />
          </div>
          <div>
            <b>{supplier.name}</b>
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-primary-500">Supplier Portal</div>
          </div>
        </div>
        <nav className="ml-6 hidden gap-1 sm:flex">
          <Link href="/supplier/dashboard" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <LayoutDashboard size={16} />
            Jobs
          </Link>
          <Link href="/supplier/verification" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <ShieldCheck size={16} />
            Verification
          </Link>
        </nav>
        <form action={signOut} className="ml-auto">
          <button className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </form>
      </header>
      <div className="p-4 md:p-6 xl:p-8">{children}</div>
    </div>
  );
}
