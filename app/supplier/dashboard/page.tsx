import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierDashboard } from "@/components/pages/SupplierDashboard";
import type { JobOfferView } from "@/lib/supabase/database.types";

export default async function SupplierDashboardPage() {
  await requireSupplier();
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("job_offer_view")
    .select("*")
    .order("offered_at", { ascending: false });

  return <SupplierDashboard jobs={(jobs ?? []) as JobOfferView[]} />;
}
