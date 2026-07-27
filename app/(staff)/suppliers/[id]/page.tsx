import { notFound } from "next/navigation";
import { FileText, Truck } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierDecisionButtons } from "./SupplierDecisionButtons";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const [{ data: supplier }, { data: vehicles }, { data: documents }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase.from("supplier_vehicles").select("*").eq("supplier_id", id).order("created_at"),
    supabase.from("supplier_documents").select("*").eq("supplier_id", id).order("uploaded_at"),
  ]);

  if (!supplier) notFound();

  const signedUrls = await Promise.all(
    (documents ?? []).map(async (doc) => {
      const { data } = await supabase.storage.from("supplier-documents").createSignedUrl(doc.storage_path, 3600);
      return { id: doc.id, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title={supplier.name}
        text={`${supplier.type === "individual" ? "Individual driver" : "Company / travel agency"} · ${supplier.region ?? "No region set"}`}
        action={
          supplier.status === "submitted" || supplier.status === "invited" ? (
            <SupplierDecisionButtons supplierId={supplier.id} />
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle title="Business details" sub="Submitted by the supplier during verification" />
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Status" value={supplier.status} />
            <Row label="Contact" value={supplier.contact_name} />
            <Row label="Email" value={supplier.email} />
            <Row label="Phone" value={supplier.phone} />
            <Row label="WhatsApp" value={supplier.whatsapp} />
            <Row label="Registration number" value={supplier.registration_number} />
            <Row label="VAT number" value={supplier.vat_number} />
            <Row label="Insurance details" value={supplier.insurance_details} />
            <Row label="License number" value={supplier.license_number} />
            {supplier.notes && (
              <div className="border-t pt-2">
                <div className="text-slate-500">Internal notes</div>
                <p className="mt-1">{supplier.notes}</p>
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Vehicles" sub={`${(vehicles ?? []).length} submitted`} />
            <div className="mt-4 space-y-2">
              {(vehicles ?? []).map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <Truck size={16} className="shrink-0 text-slate-400" />
                  <div>
                    <b>{v.vehicle_type}</b>
                    {v.seat_capacity && <span className="text-slate-500"> · {v.seat_capacity} seats</span>}
                    {v.plate_number && <span className="text-slate-500"> · {v.plate_number}</span>}
                  </div>
                </div>
              ))}
              {(vehicles ?? []).length === 0 && <p className="text-sm text-slate-400">No vehicles submitted yet.</p>}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Documents" sub={`${(documents ?? []).length} uploaded`} />
            <div className="mt-4 space-y-2">
              {(documents ?? []).map((doc) => {
                const url = signedUrls.find((s) => s.id === doc.id)?.url;
                return (
                  <a
                    key={doc.id}
                    href={url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border p-3 text-sm hover:bg-slate-50"
                  >
                    <FileText size={16} className="shrink-0 text-slate-400" />
                    <div>
                      <b>{doc.label}</b>
                      <div className="text-xs text-slate-500">{doc.file_name}</div>
                    </div>
                  </a>
                );
              })}
              {(documents ?? []).length === 0 && <p className="text-sm text-slate-400">No documents uploaded yet.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold capitalize">{value ?? "—"}</span>
    </div>
  );
}
