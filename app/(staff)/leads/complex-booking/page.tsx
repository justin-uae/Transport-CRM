import { redirect } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { landingHrefForProfile } from "@/lib/landing";
import { ComplexBookingPage } from "@/components/pages/ComplexBookingPage";

export default async function ComplexBooking() {
  const profile = await requireProfile();
  if (!(await hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD))) {
    redirect(await landingHrefForProfile(profile));
  }
  const supabase = await createClient();

  const [{ data: customers }, { data: vehicleTypes }] = await Promise.all([
    supabase.from("customers").select("id, company_name, contact_name, email").order("contact_name"),
    supabase.from("vehicle_types").select("id, name, seat_capacity").eq("is_active", true).order("seat_capacity"),
  ]);

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Complex Booking"
        text="Paste a multi-day itinerary or upload a quote file — AI reads it and builds every leg for you to review before a lead is created."
      />
      <Panel>
        <ComplexBookingPage customers={customers ?? []} vehicleTypes={vehicleTypes ?? []} />
      </Panel>
    </div>
  );
}
