"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsForGbpValue } from "@/lib/quoteMoney";
import { convertToGbp } from "@/lib/fxRates";
import { sendTemplatedEmail } from "@/lib/emailTemplates";
import { generateQuotePdf } from "@/lib/quotePdf";

interface MilestoneInput {
  label: string;
  amount: number;
  dueDate: string | null;
}

interface LineItemInput {
  description: string;
  amount: number;
  category: "waiting_time" | "toll" | "parking" | "other";
}

export async function createQuoteAction(
  _prevState: { error: string | null; link: string | null; warnLowSupplierCost?: boolean },
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
    .select("id, brand_id, customer_id, lead_id, customers(contact_name, company_name, email), enquiry_legs(sequence, vehicle_type_id, vehicle_description, vehicle_types(name))")
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

  // QTE-02: missing/zero supplier cost is a warning, not a hard block —
  // staff can still save without one (e.g. the supplier isn't picked yet),
  // but has to explicitly acknowledge it first.
  const supplierEstimatedCostRaw = String(formData.get("supplierEstimatedCost") ?? "").trim();
  const supplierEstimatedCost = supplierEstimatedCostRaw ? Number(supplierEstimatedCostRaw) : null;
  if ((!supplierEstimatedCost || supplierEstimatedCost <= 0) && formData.get("confirmedLowSupplierCost") !== "true") {
    return {
      error: null,
      link: null,
      warnLowSupplierCost: true,
    };
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

  // QTE-04: a milestone schedule, when provided, is a third payment-plan
  // mode that supersedes the simple deposit fields entirely (see
  // amountDueNow in lib/quoteMoney.ts) — so a deposit choice is ignored
  // whenever milestones are present.
  let milestones: MilestoneInput[] = [];
  const milestonesRaw = String(formData.get("milestones") ?? "").trim();
  if (milestonesRaw) {
    try {
      const parsed = JSON.parse(milestonesRaw) as unknown[];
      milestones = parsed
        .map((m) => {
          const row = m as { label?: unknown; amount?: unknown; dueDate?: unknown };
          const label = String(row.label ?? "").trim();
          const amount = Number(row.amount ?? 0);
          if (!label || !amount || amount <= 0) return null;
          return { label, amount, dueDate: row.dueDate ? String(row.dueDate) : null };
        })
        .filter((m): m is MilestoneInput => m !== null);
    } catch {
      milestones = [];
    }
  }

  const depositPercentageRaw = Number(formData.get("depositPercentage") ?? "");
  const depositFixedAmountRaw = Number(formData.get("depositFixedAmount") ?? "");
  const hasMilestones = milestones.length > 0;
  const depositPercentage = !hasMilestones && [25, 50, 75].includes(depositPercentageRaw) ? depositPercentageRaw : null;
  const depositFixedAmount = !hasMilestones && !depositPercentage && depositFixedAmountRaw > 0 ? depositFixedAmountRaw : null;

  // FIN-02: itemised extras — a display breakdown only, never fed into the
  // selling price or any payment math (see the migration's header comment).
  let lineItems: LineItemInput[] = [];
  const lineItemsRaw = String(formData.get("lineItems") ?? "").trim();
  if (lineItemsRaw) {
    try {
      const parsed = JSON.parse(lineItemsRaw) as unknown[];
      const categories = new Set(["waiting_time", "toll", "parking", "other"]);
      lineItems = parsed
        .map((li) => {
          const row = li as { description?: unknown; amount?: unknown; category?: unknown };
          const description = String(row.description ?? "").trim();
          const amount = Number(row.amount ?? 0);
          const category = categories.has(String(row.category)) ? (row.category as LineItemInput["category"]) : "other";
          if (!description || !amount) return null;
          return { description, amount, category };
        })
        .filter((li): li is LineItemInput => li !== null);
    } catch {
      lineItems = [];
    }
  }

  // Stripe is only offered once the selling price converts to under £1000
  // GBP, regardless of the quote's own currency — convert in the background
  // here rather than showing Stripe based on the raw (possibly non-GBP)
  // number. If the conversion can't be confirmed (rate source unreachable or
  // an unrecognised currency code), fall back to the threshold itself so
  // paymentMethodsForGbpValue resolves to bank-transfer-only rather than
  // risk offering Stripe on an unverified amount.
  let sellingPriceGbp: number;
  try {
    sellingPriceGbp = await convertToGbp(sellingPrice, currency);
  } catch (err) {
    console.error(`convertToGbp failed for ${sellingPrice} ${currency}:`, err);
    sellingPriceGbp = STRIPE_PRICE_THRESHOLD;
  }

  // Vehicle is chosen once, at lead/enquiry intake — the quote just inherits
  // whatever the enquiry's first leg already has, rather than asking staff
  // to pick it again.
  const legs = (enquiry.enquiry_legs as unknown as { sequence: number; vehicle_type_id: string | null; vehicle_description: string | null; vehicle_types: { name: string } | null }[]) ?? [];
  const firstLeg = [...legs].sort((a, b) => a.sequence - b.sequence)[0];

  const { data: version, error: versionError } = await supabase
    .from("quote_versions")
    .insert({
      quote_id: quote.id,
      version_number: 1,
      vehicle_type_id: firstLeg?.vehicle_type_id ?? null,
      vehicle_description: firstLeg?.vehicle_types?.name ?? firstLeg?.vehicle_description ?? null,
      supplier_estimated_cost: supplierEstimatedCost,
      selling_price: sellingPrice,
      currency,
      deposit_percentage: depositPercentage,
      deposit_fixed_amount: depositFixedAmount,
      // System-computed, never a manual staff toggle — below the
      // GBP-converted threshold is Stripe-only, at or above it is
      // bank-transfer-only.
      payment_methods: paymentMethodsForGbpValue(sellingPriceGbp),
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

  if (milestones.length > 0) {
    await supabase.from("quote_payment_milestones").insert(
      milestones.map((m, i) => ({
        tenant_id: actor.tenant_id,
        quote_id: quote.id,
        sequence: i + 1,
        label: m.label,
        amount: m.amount,
        due_date: m.dueDate,
      })),
    );
  }

  if (lineItems.length > 0) {
    await supabase.from("quote_line_items").insert(
      lineItems.map((li, i) => ({
        tenant_id: actor.tenant_id,
        quote_version_id: version.id,
        sequence: i + 1,
        description: li.description,
        amount: li.amount,
        category: li.category,
      })),
    );
  }

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

    const customer = enquiry.customers as unknown as { contact_name: string; company_name: string | null; email: string | null } | null;
    // A PDF-generation failure (e.g. an unreachable brand logo URL) should
    // never block the quote from sending — fall back to no attachment, but
    // log it so a silent failure in production is still visible somewhere.
    const quotePdf = await generateQuotePdf(supabase, quote.id).catch((err) => {
      console.error(`generateQuotePdf failed for quote ${quote.id}:`, err);
      return null;
    });
    await sendTemplatedEmail(supabase, {
      tenantId: actor.tenant_id,
      key: "quote_sent",
      to: customer?.email,
      variables: {
        customer_name: customer?.company_name || customer?.contact_name || "Customer",
        quote_number: quote.quote_number,
        brand_name: brand.name,
        currency,
        selling_price: sellingPrice.toFixed(2),
        link: publicLink,
      },
      attachments: quotePdf ? [{ filename: `${quote.quote_number}.pdf`, content: quotePdf, contentType: "application/pdf" }] : undefined,
    });
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
