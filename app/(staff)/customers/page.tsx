import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function CustomersPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, company_name, contact_name, email, phone, country, created_at, profiles(full_name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Customers"
        text="Every company and contact your team has quoted or booked for."
        action={<NewCustomerForm />}
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Country</th>
                <th>Account manager</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c) => (
                <tr key={c.id} className="cursor-pointer border-t hover:bg-orange-50/30">
                  <td className="whitespace-nowrap py-4">
                    <Link href={`/customers/${c.id}`} className="block">
                      <div className="font-bold">{c.company_name || c.contact_name}</div>
                      {c.company_name && <div className="text-xs text-slate-500">{c.contact_name}</div>}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="block">{c.email ?? "—"}</Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="block">{c.phone ?? "—"}</Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="block">{c.country ?? "—"}</Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="block">
                      {(c.profiles as unknown as { full_name: string } | null)?.full_name ?? "—"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/customers/${c.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold text-slate-500">
                      View
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(customers ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No customers yet — add one to get started.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
