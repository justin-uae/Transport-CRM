import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { NewQuoteForm } from "./NewQuoteForm";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ enquiryId?: string }>;
}) {
  const profile = await requireProfile();
  const { enquiryId } = await searchParams;
  const supabase = await createClient();

  if (!enquiryId) {
    const { data: enquiries } = await supabase
      .from("enquiries")
      .select(
        "id, created_at, customers(company_name, contact_name), enquiry_legs(pickup_address, destination_address, pickup_date)",
      )
      .eq("assigned_user_id", profile.id)
      .order("created_at", { ascending: false });

    return (
      <div>
        <PageHead eyebrow="Sales Workspace" title="Select an Enquiry" text="Choose which enquiry to build a quote for." />
        <Panel>
          <div className="space-y-2">
            {(enquiries ?? []).map((e) => {
              const leg = (e.enquiry_legs as unknown as { pickup_address: string; destination_address: string }[] | null)?.[0];
              const customer = e.customers as unknown as { company_name: string | null; contact_name: string } | null;
              return (
                <Link
                  key={e.id}
                  href={`/quotes/new?enquiryId=${e.id}`}
                  className="flex items-center justify-between rounded-xl border p-4 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-bold">{customer?.company_name || customer?.contact_name || "Enquiry"}</div>
                    <div className="text-xs text-slate-500">
                      {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "No journey details yet"}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-primary-600">Quote this →</span>
                </Link>
              );
            })}
            {(enquiries ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                No enquiries assigned to you yet.{" "}
                <Link href="/leads/new" className="font-bold text-primary-600">
                  Add one first.
                </Link>
              </p>
            )}
          </div>
        </Panel>
      </div>
    );
  }

  const [{ data: enquiry }, { data: vehicleTypes }] = await Promise.all([
    supabase
      .from("enquiries")
      .select(
        "id, brand_id, customer_id, customers(company_name, contact_name, email), enquiry_legs(pickup_address, destination_address, pickup_date, passenger_count), brands(default_currency)",
      )
      .eq("id", enquiryId)
      .single(),
    supabase.from("vehicle_types").select("id, name, seat_capacity").eq("is_active", true).order("seat_capacity"),
  ]);

  if (!enquiry) redirect("/quotes/new");

  const canSend = await hasPermission(profile, PERMISSIONS.QUOTES_SEND);
  const customer = enquiry.customers as unknown as { company_name: string | null; contact_name: string } | null;
  const leg = (enquiry.enquiry_legs as unknown as
    | { pickup_address: string; destination_address: string; pickup_date: string | null; passenger_count: number | null }[]
    | null)?.[0];
  const brand = enquiry.brands as unknown as { default_currency: string } | null;

  return (
    <div>
      <PageHead eyebrow="Sales Workspace" title="Build Quote" text="Price the journey and send a professional quotation." />
      <NewQuoteForm
        enquiryId={enquiry.id}
        customerName={customer?.company_name || customer?.contact_name || "Customer"}
        pickup={leg?.pickup_address ?? "—"}
        destination={leg?.destination_address ?? "—"}
        pickupDate={leg?.pickup_date ?? null}
        passengerCount={leg?.passenger_count ?? null}
        defaultCurrency={brand?.default_currency ?? "EUR"}
        vehicleTypes={vehicleTypes ?? []}
        canSend={canSend}
      />
    </div>
  );
}
