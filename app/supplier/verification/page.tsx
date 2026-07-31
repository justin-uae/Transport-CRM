import { PageHead } from "@/components/ui/PageHead";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VerificationForm } from "./VerificationForm";

export default async function SupplierVerificationPage() {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: vehicles }, { data: documents }] = await Promise.all([
    supabase.from("supplier_vehicles").select("*").eq("supplier_id", supplier.id).order("created_at"),
    supabase.from("supplier_documents").select("*").eq("supplier_id", supplier.id).order("uploaded_at"),
  ]);

  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <PageHead eyebrow="Supplier Portal" title="Verification" text="Complete your business details and upload documents for review." />
      </div>
      <VerificationForm supplier={supplier} vehicles={vehicles ?? []} documents={documents ?? []} />
    </div>
  );
}
