import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewRoleForm } from "./NewRoleForm";

export default async function RolesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, description, is_system, role_permissions(count)")
    .order("is_system", { ascending: false })
    .order("name");

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Roles & Permissions"
        text="Predefined system roles plus any custom roles for your organisation."
        action={<NewRoleForm />}
      />
      <div className="grid gap-3">
        {(roles ?? []).map((role) => (
          <Link key={role.id} href={`/settings/roles/${role.id}`}>
            <Panel className="flex items-center justify-between gap-3 transition hover:border-primary-300">
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <b>{role.name}</b>
                    {role.is_system && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        System
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{role.description ?? "No description"}</p>
                </div>
              </div>
              <ChevronRight className="text-slate-300" size={18} />
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
