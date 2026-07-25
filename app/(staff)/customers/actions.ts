"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function createCustomerAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add customers." };

  const contactName = String(formData.get("contactName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!contactName) {
    return { error: "Contact name is required." };
  }

  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: actor.tenant_id,
      contact_name: contactName,
      company_name: companyName,
      email,
      phone,
      country,
      notes,
      account_manager_id: actor.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "customer_created",
    entityType: "customer",
    entityId: customer.id,
    newValue: { contactName, companyName },
  });

  revalidatePath("/customers");
  return { error: null };
}
