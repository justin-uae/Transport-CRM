import Link from "next/link";
import { Users, ShieldCheck, Building2, History, Settings as SettingsIcon } from "lucide-react";

const SETTINGS_NAV = [
  { label: "Overview", href: "/settings", icon: SettingsIcon },
  { label: "Users", href: "/settings/users", icon: Users },
  { label: "Roles & Permissions", href: "/settings/roles", icon: ShieldCheck },
  { label: "Companies & Brands", href: "/settings/brands", icon: Building2 },
  { label: "Audit Log", href: "/settings/audit-log", icon: History },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {SETTINGS_NAV.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:border-primary-300 hover:text-primary-700"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
