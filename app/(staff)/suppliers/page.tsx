import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
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

const PAGE_SIZE = 25;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("suppliers")
    .select("id, name, type, region, status, email, phone, created_at", { count: "exact" });
  if (q) {
    query = query.or(`name.ilike.%${q}%,region.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
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
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search suppliers by name, region or email…" />
        </div>
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
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Panel>
    </div>
  );
}
