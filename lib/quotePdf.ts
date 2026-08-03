import "server-only";
import PDFDocument from "pdfkit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

interface BrandSnapshot {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface VersionRow {
  vehicle_description: string | null;
  selling_price: number;
  deposit_percentage: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean } | null;
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: BrandSnapshot | null;
}

interface LegRow {
  sequence: number;
  journey_type: string;
  pickup_address: string;
  destination_address: string;
  via_points: string[] | null;
  pickup_date: string | null;
  pickup_time: string | null;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  wheelchair_required: boolean | null;
  child_seats: number | null;
  special_requirements: string | null;
  vehicle_types: { name: string } | null;
}

interface QuotePdfRow {
  id: string;
  quote_number: string;
  status: string;
  currency: string;
  expiry_at: string | null;
  created_at: string;
  brand_id: string;
  customers: { company_name: string | null; contact_name: string; email: string | null; phone: string | null } | null;
  enquiries: { enquiry_legs: LegRow[] } | null;
  quote_versions: VersionRow | null;
}

const FALLBACK_COLOR = "#f97316";
const INK = "#1e293b";
const MUTED = "#64748b";
const PAGE_MARGIN = 50;

function money(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function fetchLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    // A broken/unreachable logo URL should never stop the quote email from
    // sending — fall back to a text-only header.
    return null;
  }
}

function defaultTermsAndConditions(brandName: string, depositPercentage: number | null): string[] {
  const paymentClause = depositPercentage
    ? `A deposit of ${depositPercentage}% of the total price is required to confirm this booking. The remaining balance is due no later than 48 hours before the scheduled pickup time, unless otherwise agreed in writing.`
    : `Full payment of the total price is required to confirm this booking.`;

  return [
    `1. Quote validity — This quotation is valid until the date shown above. ${brandName} reserves the right to revise pricing for any booking confirmed after this date.`,
    `2. Booking confirmation — This quotation does not constitute a confirmed booking. A booking is only confirmed once payment has been received as described below.`,
    `3. Payment — ${paymentClause} Accepted payment methods are shown on this quotation.`,
    `4. Cancellations & refunds — Cancellations made more than 48 hours before the scheduled pickup time are eligible for a full refund of any amount paid, less any non-recoverable third-party costs already incurred. Cancellations within 48 hours of pickup are non-refundable.`,
    `5. Changes to the journey — Changes to pickup time, location, passenger count or vehicle requirements may affect the final price and are subject to availability.`,
    `6. Vehicle & driver — ${brandName} reserves the right to substitute the vehicle and/or driver assigned to this journey with one of equal or higher standard in the event of unforeseen circumstances.`,
    `7. Waiting time — A reasonable waiting period is included at pickup. Additional waiting time beyond this may be charged at the standard hourly rate.`,
    `8. Passenger & luggage limits — The passenger and luggage capacity stated on this quotation must not be exceeded. ${brandName} may decline travel or request an additional vehicle if capacity is exceeded on the day.`,
    `9. Liability — ${brandName} carries appropriate insurance for passenger transport. Liability for loss or damage to personal belongings during the journey is limited to what is required by applicable law.`,
    `10. Force majeure — ${brandName} is not liable for delays or cancellations caused by circumstances beyond its reasonable control, including but not limited to traffic, weather, or road closures.`,
    `11. Queries — For any questions about this quotation, please reply to the email this quotation was sent with, quoting the reference number above.`,
  ];
}

/**
 * Builds a branded PDF for a quote — attached to the "quote sent" email
 * (see createQuoteAction / resendQuoteEmailAction) so the customer has a
 * downloadable, printable copy alongside the online accept/reject link.
 * Self-contained: does its own fetch of everything it needs from `quoteId`,
 * so callers don't have to widen their own queries just to build this.
 */
export async function generateQuotePdf(
  supabase: SupabaseClient<Database>,
  quoteId: string,
): Promise<Buffer | null> {
  const { data: quoteRaw } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, created_at, brand_id, " +
        "customers(company_name, contact_name, email, phone), " +
        "enquiries(enquiry_legs(sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), " +
        "quote_versions!quotes_current_version_id_fkey(vehicle_description, selling_price, deposit_percentage, payment_methods, customer_notes, terms_snapshot, brand_snapshot)",
    )
    .eq("id", quoteId)
    .single();

  if (!quoteRaw) return null;
  const quote = quoteRaw as unknown as QuotePdfRow;
  const version = quote.quote_versions;
  if (!version) return null;

  const { data: brandRow } = await supabase
    .from("brands")
    .select("company_id, companies(legal_name, registered_address, vat_number)")
    .eq("id", quote.brand_id)
    .single();
  const company = brandRow?.companies as unknown as
    | { legal_name: string; registered_address: string | null; vat_number: string | null }
    | null;

  const brand = version.brand_snapshot;
  const brandName = brand?.name ?? "Quotation";
  const brandColor = brand?.primary_color ?? FALLBACK_COLOR;
  const customer = quote.customers;
  const legs = [...(quote.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
  const logoBuffer = await fetchLogoBuffer(brand?.logo_url ?? null);

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // ---- Header band --------------------------------------------------------
  doc.rect(0, 0, pageWidth, 110).fill(brandColor);
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, PAGE_MARGIN, 28, { fit: [54, 54] });
    } catch {
      // Corrupt/unsupported image data — skip it, header still reads fine
      // with just the brand name.
    }
  }
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(brandName, logoBuffer ? PAGE_MARGIN + 66 : PAGE_MARGIN, 40, { width: contentWidth - 160 });
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("QUOTATION", PAGE_MARGIN, 38, { width: contentWidth, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(11)
    .text(quote.quote_number, PAGE_MARGIN, 66, { width: contentWidth, align: "right" });

  doc.y = 130;
  doc.fillColor(INK);

  // ---- Bill to / quote details --------------------------------------------
  const colWidth = contentWidth / 2 - 10;
  const infoTop = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text("BILL TO", PAGE_MARGIN, infoTop);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK)
    .text(customer?.company_name || customer?.contact_name || "Customer", PAGE_MARGIN, infoTop + 14, { width: colWidth });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  let billY = doc.y + 2;
  if (customer?.company_name && customer.contact_name) {
    doc.text(customer.contact_name, PAGE_MARGIN, billY, { width: colWidth });
    billY = doc.y + 2;
  }
  if (customer?.email) {
    doc.text(customer.email, PAGE_MARGIN, billY, { width: colWidth });
    billY = doc.y + 2;
  }
  if (customer?.phone) {
    doc.text(customer.phone, PAGE_MARGIN, billY, { width: colWidth });
  }

  const detailsX = PAGE_MARGIN + colWidth + 20;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text("QUOTE DETAILS", detailsX, infoTop);
  const detailRows: [string, string][] = [
    ["Issue date", formatDate(quote.created_at)],
    ["Valid until", formatDate(quote.expiry_at)],
    ["Status", quote.status.replaceAll("_", " ")],
  ];
  let detailY = infoTop + 14;
  for (const [label, value] of detailRows) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(label, detailsX, detailY, { width: colWidth / 2, continued: false });
    doc
      .font("Helvetica-Bold")
      .fillColor(INK)
      .text(value, detailsX + colWidth / 2, detailY, { width: colWidth / 2, align: "right" });
    detailY += 15;
  }

  doc.y = Math.max(billY, detailY) + 20;

  // ---- Travel details -------------------------------------------------------
  sectionHeading(doc, "Travel Details", brandColor, contentWidth);
  if (legs.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("No journey details recorded.", PAGE_MARGIN);
  }
  legs.forEach((leg, i) => {
    if (legs.length > 1) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(brandColor)
        .text(`LEG ${leg.sequence} OF ${legs.length} · ${leg.journey_type.replaceAll("_", " ").toUpperCase()}`, PAGE_MARGIN);
      doc.moveDown(0.3);
    }

    const rows: [string, string][] = [
      ["Pickup", leg.pickup_address],
      ["Destination", leg.destination_address],
    ];
    if (leg.via_points && leg.via_points.length > 0) rows.push(["Via", leg.via_points.join(" → ")]);
    rows.push(["Date & time", `${formatDate(leg.pickup_date)}${leg.pickup_time ? ` at ${leg.pickup_time}` : ""}`]);
    if (leg.journey_type === "return" && (leg.return_date || leg.return_time)) {
      rows.push(["Return", `${formatDate(leg.return_date)}${leg.return_time ? ` at ${leg.return_time}` : ""}`]);
    }
    rows.push(["Passengers", String(leg.passenger_count ?? "—")]);
    rows.push(["Luggage", String(leg.luggage_count ?? "—")]);
    rows.push(["Vehicle", leg.vehicle_types?.name ?? version.vehicle_description ?? "—"]);
    if (leg.wheelchair_required || (leg.child_seats ?? 0) > 0) {
      const parts = [
        leg.wheelchair_required ? "Wheelchair required" : null,
        (leg.child_seats ?? 0) > 0 ? `${leg.child_seats} child seat${leg.child_seats === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      rows.push(["Accessibility", parts.join(" · ")]);
    }
    if (leg.special_requirements) rows.push(["Special requirements", leg.special_requirements]);

    drawKeyValueBox(doc, rows, contentWidth);
    if (i < legs.length - 1) doc.moveDown(0.6);
  });

  doc.moveDown(1);

  // ---- Pricing ---------------------------------------------------------------
  sectionHeading(doc, "Pricing", brandColor, contentWidth);
  const priceBoxTop = doc.y;
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text("Total price", PAGE_MARGIN, priceBoxTop);
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(brandColor)
    .text(money(version.selling_price, quote.currency), PAGE_MARGIN, priceBoxTop + 14);
  doc.fillColor(INK);
  doc.y = priceBoxTop + 44;

  const pricingRows: [string, string][] = [];
  if (version.deposit_percentage) {
    const deposit = Math.round(version.selling_price * (version.deposit_percentage / 100) * 100) / 100;
    const balance = Math.round((version.selling_price - deposit) * 100) / 100;
    pricingRows.push([`Deposit due now (${version.deposit_percentage}%)`, money(deposit, quote.currency)]);
    pricingRows.push(["Balance (due before travel)", money(balance, quote.currency)]);
  } else {
    pricingRows.push(["Payment plan", "Full payment due to confirm"]);
  }
  const methods = [
    version.payment_methods?.stripe ? "Card / online payment" : null,
    version.payment_methods?.bank_transfer ? "Bank transfer" : null,
  ].filter(Boolean);
  if (methods.length > 0) pricingRows.push(["Accepted payment methods", methods.join(" · ")]);
  drawKeyValueBox(doc, pricingRows, contentWidth);

  if (version.customer_notes) {
    doc.moveDown(0.8);
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text(version.customer_notes, PAGE_MARGIN, doc.y, { width: contentWidth });
  }

  doc.moveDown(1.2);

  // ---- Terms & conditions -----------------------------------------------------
  sectionHeading(doc, "Terms & Conditions", brandColor, contentWidth);
  const terms = version.terms_snapshot?.trim()
    ? [version.terms_snapshot.trim()]
    : defaultTermsAndConditions(brandName, version.deposit_percentage);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  for (const clause of terms) {
    doc.text(clause, PAGE_MARGIN, doc.y, { width: contentWidth, align: "left" });
    doc.moveDown(0.5);
  }

  // ---- Footer on every page ---------------------------------------------------
  const pageRange = doc.bufferedPageRange();
  const footerLine =
    [company?.legal_name, company?.registered_address, company?.vat_number ? `VAT ${company.vat_number}` : null]
      .filter(Boolean)
      .join(" · ") || brandName;
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 40;
    // Writing at this y sits inside the page's bottom margin, which PDFKit
    // treats as an overflow — normally that's exactly what triggers the
    // *next* page, but here it would silently addPage() a blank page and
    // draw the footer there instead of on page i. Dropping the bottom
    // margin to 0 for these two calls disables that check.
    const restoreBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(footerLine, PAGE_MARGIN, footerY, { width: contentWidth - 100, align: "left", lineBreak: false });
    doc.text(`Page ${i - pageRange.start + 1} of ${pageRange.count}`, PAGE_MARGIN, footerY, {
      width: contentWidth,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = restoreBottomMargin;
  }

  doc.end();
  return done;
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, color: string, width: number) {
  doc.font("Helvetica-Bold").fontSize(13).fillColor(color).text(title, PAGE_MARGIN, doc.y, { width });
  doc.moveDown(0.4);
  doc.fillColor(INK);
}

/** A light grey box of label/value rows — the workhorse layout for travel + pricing details. */
function drawKeyValueBox(doc: PDFKit.PDFDocument, rows: [string, string][], width: number) {
  const startY = doc.y;
  const padding = 10;
  const labelWidth = width * 0.4 - padding;
  const valueWidth = width * 0.6 - padding;

  // Measure every row's wrapped height up front so the background box can be
  // drawn once, before any text — filling it after the fact would sit on
  // top of (and fade) the text.
  let boxHeight = padding;
  for (const [, value] of rows) {
    boxHeight += Math.max(doc.heightOfString(value, { width: valueWidth }), 12) + 8;
  }
  doc.rect(PAGE_MARGIN, startY, width, boxHeight).fillOpacity(0.04).fill(INK).fillOpacity(1);

  let y = startY + padding;
  for (const [label, value] of rows) {
    const valueHeight = doc.heightOfString(value, { width: valueWidth });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, PAGE_MARGIN + padding, y, { width: labelWidth });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(value, PAGE_MARGIN + padding + labelWidth, y, { width: valueWidth });
    y += Math.max(valueHeight, 12) + 8;
  }
  doc.y = startY + boxHeight + 4;
}
