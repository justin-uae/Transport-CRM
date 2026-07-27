"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function claimLeadAction(leadId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: lead, error } = await supabase.rpc("claim_lead", { p_lead_id: leadId });

  if (error || !lead) {
    return { error: error?.message ?? "This lead has already been claimed." };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_claimed",
    entityType: "lead",
    entityId: leadId,
  });

  revalidatePath("/leads");
  return { error: null };
}

/**
 * Fast path from an already-assigned lead straight into the quote builder —
 * creates the enquiry + first journey leg pre-filled from the lead's
 * captured details (customer is already resolved on the lead by the
 * website webhook) and redirects into /quotes/new. The manual 4-step
 * enquiry wizard at /leads/new stays for phone/walk-in enquiries with no
 * originating lead.
 */
export async function createEnquiryFromLeadAction(leadId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) {
    return { error: "You do not have permission to create enquiries." };
  }

  const supabase = await createClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead || lead.assigned_user_id !== actor.id) {
    return { error: "This lead is not assigned to you." };
  }
  if (!lead.customer_id) {
    return { error: "This lead has no linked customer yet." };
  }

  const { data: enquiry, error: enquiryError } = await supabase
    .from("enquiries")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: lead.brand_id,
      lead_id: lead.id,
      customer_id: lead.customer_id,
      assigned_user_id: actor.id,
      status: "new",
      created_by: actor.id,
    })
    .select()
    .single();

  if (enquiryError || !enquiry) {
    return { error: enquiryError?.message ?? "Could not create the enquiry." };
  }

  const { error: legError } = await supabase.from("enquiry_legs").insert({
    enquiry_id: enquiry.id,
    sequence: 1,
    journey_type: "one_way",
    pickup_address: lead.pickup_text ?? "Unknown",
    destination_address: lead.destination_text ?? "Unknown",
    pickup_date: lead.travel_date,
    passenger_count: lead.passenger_count,
    special_requirements:
      [lead.vehicle_requested ? `Vehicle requested: ${lead.vehicle_requested}` : null, lead.notes]
        .filter(Boolean)
        .join(" — ") || null,
  });

  if (legError) {
    return { error: legError.message };
  }

  await supabase.from("leads").update({ status: "converted" }).eq("id", lead.id);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "enquiry_created_from_lead",
    entityType: "enquiry",
    entityId: enquiry.id,
    previousValue: { leadId: lead.id },
  });

  revalidatePath("/leads");
  redirect(`/quotes/new?enquiryId=${enquiry.id}`);
}
