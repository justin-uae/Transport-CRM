"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function createQuoteAction(
  _prevState: { error: string | null; link: string | null },
  formData: FormData,
) {
  const actor = await requireProfile();
  const canCreate = await hasPermission(actor, PERMISSIONS.QUOTES_CREATE);
  if (!canCreate) {
    return { error: "You do not have permission to create quotes.", link: null };
  }

  const supabase = await createClient();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("id, brand_id, customer_id, lead_id")
    .eq("id", enquiryId)
    .single();

  if (!enquiry || !enquiry.brand_id) {
    return { error: "This enquiry has no brand assigned yet — set a default brand first.", link: null };
  }

  const { data: brand } = await supabase.from("brands").select("*").eq("id", enquiry.brand_id).single();
  if (!brand) {
    return { error: "Brand not found.", link: null };
  }

  const sellingPrice = Number(formData.get("sellingPrice") ?? 0);
  if (!sellingPrice || sellingPrice <= 0) {
    return { error: "Enter a selling price greater than zero.", link: null };
  }

  const currency = String(formData.get("currency") ?? brand.default_currency).trim() || brand.default_currency;

  const { data: quoteNumber, error: numberError } = await supabase.rpc("next_document_number", {
    p_brand_id: brand.id,
    p_doc_type: "quote",
    p_prefix: brand.quote_number_prefix,
  });
  if (numberError || !quoteNumber) {
    return { error: numberError?.message ?? "Could not generate a quote number.", link: null };
  }

  const expiryDays = Number(formData.get("expiryDays") ?? 7) || 7;

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: brand.id,
      enquiry_id: enquiry.id,
      customer_id: enquiry.customer_id,
      quote_number: quoteNumber,
      status: "draft",
      currency,
      expiry_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      created_by: actor.id,
    })
    .select()
    .single();

  if (quoteError || !quote) {
    return { error: quoteError?.message ?? "Could not create the quote.", link: null };
  }

  const depositOptions = formData
    .getAll("depositOptions")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const { data: version, error: versionError } = await supabase
    .from("quote_versions")
    .insert({
      quote_id: quote.id,
      version_number: 1,
      vehicle_type_id: String(formData.get("vehicleTypeId") ?? "").trim() || null,
      vehicle_description: String(formData.get("vehicleDescription") ?? "").trim() || null,
      supplier_estimated_cost: Number(formData.get("supplierEstimatedCost") ?? 0) || null,
      selling_price: sellingPrice,
      currency,
      deposit_options: depositOptions.length > 0 ? depositOptions : [25, 50, 100],
      payment_methods: {
        stripe: formData.get("paymentStripe") === "on",
        bank_transfer: formData.get("paymentBankTransfer") === "on",
      },
      customer_notes: String(formData.get("customerNotes") ?? "").trim() || null,
      terms_snapshot: String(formData.get("terms") ?? "").trim() || null,
      brand_snapshot: {
        name: brand.name,
        logo_url: brand.logo_url,
        primary_color: brand.primary_color,
      },
      created_by: actor.id,
    })
    .select()
    .single();

  if (versionError || !version) {
    return { error: versionError?.message ?? "Could not price the quote.", link: null };
  }

  await supabase.from("quotes").update({ current_version_id: version.id }).eq("id", quote.id);

  // A quote now genuinely exists for this enquiry — this is the point the
  // originating lead (if any) should read as "converted", not merely when
  // the enquiry was started.
  if (enquiry.lead_id) {
    await supabase.from("leads").update({ status: "converted" }).eq("id", enquiry.lead_id);
  }

  const canSend = await hasPermission(actor, PERMISSIONS.QUOTES_SEND);
  let publicLink: string | null = null;

  if (canSend && formData.get("sendNow") === "on") {
    await supabase
      .from("quotes")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", quote.id);
    await supabase.from("quote_events").insert({ quote_id: quote.id, event: "sent" });
    publicLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`;
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: publicLink ? "quote_sent" : "quote_created",
    entityType: "quote",
    entityId: quote.id,
    newValue: { quoteNumber: quote.quote_number, sellingPrice, currency },
  });

  revalidatePath("/quotes");
  if (enquiry.lead_id) revalidatePath("/leads");
  return { error: null, link: publicLink };
}
