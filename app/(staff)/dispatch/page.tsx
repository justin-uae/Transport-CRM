import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DispatchBoard, type JobRow, type SupplierOption } from "@/components/pages/DispatchBoard";

export default async function DispatchPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: jobs }, { data: suppliers }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, status, region, offered_at, confirmed_at, completed_at, assigned_supplier_id, supplier_invoice_note, supplier_invoice_url, quotes(quote_number, customers(company_name, contact_name)), suppliers(name)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("suppliers").select("id, name, region").eq("status", "approved").order("name"),
  ]);

  return (
    <DispatchBoard
      jobs={(jobs ?? []) as unknown as JobRow[]}
      suppliers={(suppliers ?? []) as unknown as SupplierOption[]}
    />
  );
}
