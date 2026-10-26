"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { convertToGbp } from "@/lib/fxRates";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsForGbpValue } from "@/lib/quoteMoney";
import { grossFromNet, formatVatRate } from "@/lib/vat";
import { resendQuoteEmailAction } from "./actions";

/**
 * Edit Price only applies before the customer has said yes. Once a quote is
 * accepted/paid, money is (or is about to be) involved and a price change is
 * a booking amendment instead — "Edit Booking" (amendBookingAction), which
 * handles balances, refunds and the customer/supplier notices.
 */
const PRICE_EDITABLE_STATUSES = ["draft", "sent", "viewed"];

/** Any sales-side role can edit a quote's price — see editQuotePriceAction. */
async function canEditQuotePrices(actor: Awaited<ReturnType<typeof requireProfile>>) {
  const checks = await Promise.all([
    hasPermission(actor, PERMISSIONS.QUOTES_CREATE),
    hasPermission(actor, PERMISSIONS.QUOTES_EDIT),
    hasPermission(actor, PERMISSIONS.QUOTES_SEND),
  ]);
  return checks.some(Boolean);
}

export interface EditQuotePriceInput {
  /** Selling price before VAT, same as the New Quote form. */
  netPrice: number;
  vatRate: number;
  supplierEstimatedCost: number | null;
  reason: string;
  /** Re-send the quote email (with the regenerated PDF) once saved. */
  emailCustomer: boolean;
}

interface CurrentVersion {
  id: string;
  version_number: number;
  vehicle_type_id: string | null;
  vehicle_description: string | null;
  supplier_estimated_cost: number | null;
  selling_price: number;
  vat_rate: number;
  currency: string;
  deposit_percentage: number | null;
  deposit_fixed_amount: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: unknown;
  quote_line_items: { sequence: number; description: string; amount: number; category: string }[];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

async function gbpOrThreshold(amount: number, currency: string) {
  try {
    return await convertToGbp(amount, currency);
  } catch {
    // Same fail-safe as createQuoteAction — an unconfirmable conversion is
    // treated as "at the card limit", so card payment is never offered on it.
    return STRIPE_PRICE_THRESHOLD;
  }
}

/**
 * Sets a new price on a quote that hasn't been accepted yet. Saves it as a
 * new quote_version (the old one stays, visible in the quote's Versions
 * table), switches the quote to it, records "Price changed" on the Timeline
 * with old -> new, who and why, and optionally re-sends the quote email.
 *
 * Allowed for anyone on the sales side — Master Admin, or any role holding
 * quotes.create, quotes.edit or quotes.send (Sales User, Sales Manager…) —
 * on any quote they can see (the read below goes through RLS, so a quote
 * outside their visibility is simply "not found"). Not limited to the
 * quote's own salesperson.
 */
export async function editQuotePriceAction(quoteId: string, input: EditQuotePriceInput) {
  const actor = await requireProfile();
  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required." };
  if (!Number.isFinite(input.netPrice) || input.netPrice <= 0) return { error: "Enter a selling price greater than zero." };
  if (!Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) return { error: "VAT must be between 0 and 100%." };
  if (input.supplierEstimatedCost != null && (!Number.isFinite(input.supplierEstimatedCost) || input.supplierEstimatedCost < 0)) {
    return { error: "Supplier cost can't be negative." };
  }

  // Read through the viewer's own client so RLS decides whether they can see it.
  const supabase = await createClient();
  const { data: quoteRaw } = await supabase
    .from("quotes")
    .select(
      "id, tenant_id, quote_number, status, currency, created_by, enquiries(assigned_user_id), quote_payment_milestones(id, sequence, amount), " +
        "quote_versions!quotes_current_version_id_fkey(id, version_number, vehicle_type_id, vehicle_description, supplier_estimated_cost, selling_price, vat_rate, currency, deposit_percentage, deposit_fixed_amount, payment_methods, customer_notes, terms_snapshot, brand_snapshot, quote_line_items(sequence, description, amount, category))",
    )
    .eq("id", quoteId)
    .single();
  if (!quoteRaw) return { error: "Quote not found." };
  const quote = quoteRaw as unknown as {
    id: string;
    tenant_id: string;
    quote_number: string;
    status: string;
    currency: string;
    created_by: string | null;
    enquiries: { assigned_user_id: string | null } | null;
    quote_payment_milestones: { id: string; sequence: number; amount: number }[];
    quote_versions: CurrentVersion | null;
  };

  const allowed = actor.is_master_admin || (await canEditQuotePrices(actor));
  if (!allowed) return { error: "You don't have permission to change this quote's price." };
  if (!PRICE_EDITABLE_STATUSES.includes(quote.status)) {
    return { error: "This quote has already been accepted or closed — use Edit Booking to change the price of a booking." };
  }
  const version = quote.quote_versions;
  if (!version) return { error: "This quote has no priced version to edit." };

  const newPrice = grossFromNet(input.netPrice, input.vatRate);
  const newSupplierCost = input.supplierEstimatedCost;
  const priceChanged = Math.abs(newPrice - version.selling_price) > 0.001 || Number(version.vat_rate) !== input.vatRate;
  const costChanged = (newSupplierCost ?? null) !== (version.supplier_estimated_cost ?? null);
  if (!priceChanged && !costChanged) return { error: "Nothing changed — enter a different price, VAT or supplier cost." };

  // ---- Payment methods: same £ card limit as at creation ------------------
  // Above the limit -> bank transfer only, unless Master Admin has approved
  // card payment for this specific quote (0102). Dropping from above to below
  // the limit gets the normal default for the new amount. Otherwise whatever
  // was chosen at creation (e.g. "force bank transfer") is kept.
  const admin = createAdminClient();
  const [oldGbp, newGbp] = await Promise.all([gbpOrThreshold(version.selling_price, quote.currency), gbpOrThreshold(newPrice, quote.currency)]);
  let paymentMethods = version.payment_methods;
  if (newGbp >= STRIPE_PRICE_THRESHOLD) {
    const { data: approvedOverride } = await admin
      .from("card_payment_override_requests")
      .select("id")
      .eq("quote_id", quote.id)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();
    if (!approvedOverride) paymentMethods = { stripe: false, bank_transfer: true };
  } else if (oldGbp >= STRIPE_PRICE_THRESHOLD) {
    paymentMethods = paymentMethodsForGbpValue(newGbp);
  }

  // ---- Deposit terms -----------------------------------------------------
  // A percentage deposit scales on its own. A fixed deposit that would now be
  // the whole price (or more) no longer makes sense — dropped to "pay in full".
  const notes: string[] = [];
  let depositFixed = version.deposit_fixed_amount;
  if (depositFixed != null && depositFixed >= newPrice) {
    depositFixed = null;
    notes.push("fixed deposit removed (it was no longer less than the price)");
  }

  // ---- Payment schedule: rescale proportionally --------------------------
  // Milestones belong to the quote, not the version, and must keep adding up
  // to the full price — each keeps its share, the last absorbs the rounding.
  const milestones = [...quote.quote_payment_milestones].sort((a, b) => a.sequence - b.sequence);
  const milestoneUpdates: { id: string; amount: number }[] = [];
  if (priceChanged && milestones.length > 0) {
    const oldTotal = milestones.reduce((sum, m) => sum + Number(m.amount), 0);
    let allocated = 0;
    milestones.forEach((m, i) => {
      const amount = i === milestones.length - 1 ? round2(newPrice - allocated) : round2((Number(m.amount) / oldTotal) * newPrice);
      allocated = round2(allocated + amount);
      milestoneUpdates.push({ id: m.id, amount });
    });
    if (milestoneUpdates.some((m) => m.amount <= 0)) return { error: "The payment schedule can't be rescaled to this price — edit it to fewer steps first." };
    notes.push("payment schedule rescaled to the new price");
  }

  // ---- New version -------------------------------------------------------
  const { data: maxVersion } = await admin
    .from("quote_versions")
    .select("version_number")
    .eq("quote_id", quote.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  const { data: newVersion, error: versionError } = await admin
    .from("quote_versions")
    .insert({
      quote_id: quote.id,
      version_number: (maxVersion?.version_number ?? version.version_number) + 1,
      vehicle_type_id: version.vehicle_type_id,
      vehicle_description: version.vehicle_description,
      supplier_estimated_cost: newSupplierCost,
      selling_price: newPrice,
      vat_rate: input.vatRate,
      currency: version.currency,
      deposit_percentage: version.deposit_percentage as 25 | 50 | 75 | null,
      deposit_fixed_amount: depositFixed,
      payment_methods: paymentMethods,
      customer_notes: version.customer_notes,
      terms_snapshot: version.terms_snapshot,
      brand_snapshot: version.brand_snapshot as Record<string, unknown>,
      created_by: actor.id,
    })
    .select("id, version_number")
    .single();
  if (versionError || !newVersion) return { error: versionError?.message ?? "Could not save the new price." };

  // Itemised extras are a breakdown, not part of the price — carried as-is.
  if (version.quote_line_items.length > 0) {
    await admin.from("quote_line_items").insert(
      version.quote_line_items.map((li) => ({
        tenant_id: quote.tenant_id,
        quote_version_id: newVersion.id,
        sequence: li.sequence,
        description: li.description,
        amount: li.amount,
        category: li.category,
      })),
    );
  }
  for (const m of milestoneUpdates) {
    await admin.from("quote_payment_milestones").update({ amount: m.amount }).eq("id", m.id);
  }

  const { error: switchError } = await admin.from("quotes").update({ current_version_id: newVersion.id }).eq("id", quote.id);
  if (switchError) return { error: switchError.message };

  // ---- Timeline + audit --------------------------------------------------
  const vatNote = input.vatRate > 0 ? ` incl. ${formatVatRate(input.vatRate)} VAT` : "";
  const parts = [
    priceChanged ? `${money(version.selling_price, quote.currency)} → ${money(newPrice, quote.currency)}${vatNote}` : null,
    costChanged
      ? `supplier cost ${version.supplier_estimated_cost != null ? money(version.supplier_estimated_cost, quote.currency) : "—"} → ${newSupplierCost != null ? money(newSupplierCost, quote.currency) : "—"}`
      : null,
  ].filter(Boolean);
  await admin.from("quote_events").insert({
    quote_id: quote.id,
    event: "price_changed",
    detail: `${parts.join(", ")} by ${actor.full_name} (version ${newVersion.version_number}) — ${reason}${notes.length ? ` · ${notes.join("; ")}` : ""}`,
  });
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_price_changed",
    entityType: "quote",
    entityId: quote.id,
    reason,
    previousValue: { sellingPrice: version.selling_price, vatRate: version.vat_rate, supplierEstimatedCost: version.supplier_estimated_cost, versionId: version.id },
    newValue: { sellingPrice: newPrice, vatRate: input.vatRate, supplierEstimatedCost: newSupplierCost, versionId: newVersion.id, paymentMethods },
  });

  // ---- Optional re-send --------------------------------------------------
  let warning: string | null = null;
  if (input.emailCustomer && quote.status !== "draft") {
    const sent = await resendQuoteEmailAction(quote.id);
    if (sent?.error) warning = `Price updated, but the email to the customer failed: ${sent.error}`;
  }

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { error: null, warning };
}
