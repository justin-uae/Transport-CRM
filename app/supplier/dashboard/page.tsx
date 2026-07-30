import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierDashboard } from "@/components/pages/SupplierDashboard";
import type { JobOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function SupplierDashboardPage() {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: jobs }, { data: invoices }] = await Promise.all([
    supabase.from("job_offer_view").select("*").order("offered_at", { ascending: false }),
    supabase.from("job_supplier_invoices").select("*").eq("supplier_id", supplier.id),
  ]);

  return (
    <SupplierDashboard
      jobs={(jobs ?? []) as JobOfferView[]}
      invoices={(invoices ?? []) as JobSupplierInvoice[]}
      supplierId={supplier.id}
    />
  );
}
