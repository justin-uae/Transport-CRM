import { Bus } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-appbg px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-500 text-white">
            <Bus size={26} />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900">Global Transport</div>
            <div className="text-[10px] font-bold uppercase tracking-[.22em] text-primary-500">
              Enterprise CRM
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
