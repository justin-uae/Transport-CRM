import Link from "next/link";
import { Users, ShieldCheck, Building2, History } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const CARDS = [
  { label: "Users", href: "/settings/users", icon: Users, text: "Invite users, assign a brand and region, and manage account status." },
  { label: "Roles & Permissions", href: "/settings/roles", icon: ShieldCheck, text: "Create custom roles and control granular permissions." },
  { label: "Companies & Brands", href: "/settings/brands", icon: Building2, text: "Manage legal companies, trading brands and numbering." },
  { label: "Audit Log", href: "/settings/audit-log", icon: History, text: "Review every financial, pricing and user change." },
];

export default async function SettingsOverviewPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", profile.tenant_id)
    .single();

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Settings"
        text={`Configuration for ${tenant?.name ?? "your organisation"}.`}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ label, href, icon: Icon, text }) => (
          <Link key={href} href={href}>
            <Panel className="h-full transition hover:border-primary-300">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-black">{label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
