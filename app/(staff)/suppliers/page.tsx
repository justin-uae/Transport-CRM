import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddSupplierForm } from "./AddSupplierForm";
import type { Supplier, SupplierStatus } from "@/lib/supabase/database.types";

const STATUS_STYLE: Record<SupplierStatus, string> = {
  invited: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  suspended: "bg-amber-50 text-amber-700",
};

type SupplierListRow = Pick<Supplier, "id" | "name" | "type" | "region" | "status" | "email" | "phone" | "created_at">;

export default async function SuppliersPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("suppliers")
    .select("id, name, type, region, status, email, phone, created_at")
    .order("created_at", { ascending: false });
  const suppliers = (data ?? []) as unknown as SupplierListRow[];

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Suppliers"
        text="Transport companies and individual drivers — invite, verify and approve before they receive jobs."
        action={<AddSupplierForm />}
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Supplier</th>
                <th>Type</th>
                <th>Region</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-4">
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.email}</div>
                  </td>
                  <td className="capitalize">{s.type}</td>
                  <td>{s.region ?? "—"}</td>
                  <td>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/suppliers/${s.id}`} className="rounded-lg border px-3 py-2 text-xs font-bold">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No suppliers yet — add one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
