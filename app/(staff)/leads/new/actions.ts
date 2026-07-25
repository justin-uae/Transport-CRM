"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function createEnquiryAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add enquiries." };

  const supabase = await createClient();

  let customerId = String(formData.get("existingCustomerId") ?? "").trim();
  if (!customerId) {
    const contactName = String(formData.get("newContactName") ?? "").trim();
    if (!contactName) {
      return { error: "Select an existing customer or enter a new contact name." };
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        tenant_id: actor.tenant_id,
        contact_name: contactName,
        company_name: String(formData.get("newCompanyName") ?? "").trim() || null,
        email: String(formData.get("newEmail") ?? "").trim() || null,
        phone: String(formData.get("newPhone") ?? "").trim() || null,
        country: String(formData.get("newCountry") ?? "").trim() || null,
        account_manager_id: actor.id,
      })
      .select()
      .single();

    if (customerError || !customer) {
      return { error: customerError?.message ?? "Could not create the customer." };
    }
    customerId = customer.id;
  }

  const pickupAddress = String(formData.get("pickupAddress") ?? "").trim();
  const destinationAddress = String(formData.get("destinationAddress") ?? "").trim();
  if (!pickupAddress || !destinationAddress) {
    return { error: "Pickup and destination are required." };
  }

  const { data: enquiry, error: enquiryError } = await supabase
    .from("enquiries")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: actor.default_brand_id,
      customer_id: customerId,
      assigned_user_id: actor.id,
      status: "new",
      internal_notes: String(formData.get("internalNotes") ?? "").trim() || null,
      created_by: actor.id,
    })
    .select()
    .single();

  if (enquiryError || !enquiry) {
    return { error: enquiryError?.message ?? "Could not create the enquiry." };
  }

  const passengerCount = Number(formData.get("passengerCount") ?? 0) || null;
  const luggageCount = Number(formData.get("luggageCount") ?? 0) || null;
  const childSeats = Number(formData.get("childSeats") ?? 0) || 0;

  const { error: legError } = await supabase.from("enquiry_legs").insert({
    enquiry_id: enquiry.id,
    sequence: 1,
    journey_type: String(formData.get("journeyType") ?? "one_way"),
    pickup_address: pickupAddress,
    destination_address: destinationAddress,
    pickup_date: String(formData.get("pickupDate") ?? "").trim() || null,
    pickup_time: String(formData.get("pickupTime") ?? "").trim() || null,
    passenger_count: passengerCount,
    luggage_count: luggageCount,
    vehicle_type_id: String(formData.get("vehicleTypeId") ?? "").trim() || null,
    wheelchair_required: formData.get("wheelchairRequired") === "on",
    child_seats: childSeats,
    special_requirements: String(formData.get("specialRequirements") ?? "").trim() || null,
  });

  if (legError) {
    return { error: legError.message };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "enquiry_created",
    entityType: "enquiry",
    entityId: enquiry.id,
    newValue: { customerId, pickupAddress, destinationAddress },
  });

  revalidatePath("/leads");
  redirect(`/quotes/new?enquiryId=${enquiry.id}`);
}
