import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierOverview } from "@/components/pages/SupplierOverview";
import { isNewOffer, isActiveJob } from "@/lib/supplierJobStatus";
import type { JobOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function SupplierDashboardPage() {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: jobs }, { data: invoices }] = await Promise.all([
    supabase.from("job_offer_view").select("*").order("offered_at", { ascending: false }),
    supabase.from("job_supplier_invoices").select("*").eq("supplier_id", supplier.id),
  ]);

  const allJobs = (jobs ?? []) as JobOfferView[];
  const invoicedJobIds = new Set(((invoices ?? []) as JobSupplierInvoice[]).map((inv) => inv.job_id));

  const completedJobs = allJobs.filter((j) => j.job_status === "completed");

  return (
    <SupplierOverview
      newOffers={allJobs.filter(isNewOffer).length}
      activeJobs={allJobs.filter(isActiveJob).length}
      completedJobs={completedJobs.length}
      pendingInvoices={completedJobs.filter((j) => !invoicedJobIds.has(j.job_id)).length}
      recentJobs={allJobs.slice(0, 5)}
    />
  );
}
