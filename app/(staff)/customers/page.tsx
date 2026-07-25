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
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Country</th>
                <th>Account manager</th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-4">
                    <div className="font-bold">{c.company_name || c.contact_name}</div>
                    {c.company_name && <div className="text-xs text-slate-500">{c.contact_name}</div>}
                  </td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td>{c.country ?? "—"}</td>
                  <td>{(c.profiles as unknown as { full_name: string } | null)?.full_name ?? "—"}</td>
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
