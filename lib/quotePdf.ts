import "server-only";
import { readFileSync } from "fs";
import path from "path";
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

// Fixed names this file's own font(...) calls use — never "Helvetica"
// directly (see resolveFontSources below for why).
const FONT_REGULAR = "Regular";
const FONT_BOLD = "Bold";

/**
 * pdfkit's built-in "Helvetica"/"Helvetica-Bold" names aren't real embedded
 * fonts — selecting them makes pdfkit read glyph-width metrics from an .afm
 * file under node_modules/pdfkit/js/data/ at render time. That file has
 * been observed missing in at least one production deployment (Next.js'
 * bundler doesn't reliably carry a dependency's non-JS data files into a
 * trimmed build), which crashes PDF generation entirely.
 *
 * Embedding a real font file sidesteps this: pdfkit reads metrics straight
 * out of the font's own tables, no separate data file involved. Next.js
 * ships one for its own OG-image feature (Geist, permissively licensed),
 * which is about as reliably present as any file can be in a Next.js
 * deployment — so it doubles as our unconditional fallback here. It only
 * ships a single weight, so "Bold" reuses the same buffer (no true bold,
 * per the request that a plain default font is fine) rather than fail.
 * If even that read fails, fall back to the plain named fonts, which is
 * exactly what worked before this file existed.
 */
function resolveFontSources(): { regular: string | Buffer; bold: string | Buffer } {
  try {
    const buffer = readFileSync(
      path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"),
    );
    return { regular: buffer, bold: buffer };
  } catch {
    return { regular: "Helvetica", bold: "Helvetica-Bold" };
  }
}

// Geist (and most fonts with any OpenType typography) substitutes "fi",
// "ff", "ffi" etc. with a single ligature glyph. That renders fine visually,
// but pdfkit/fontkit doesn't always map the ligature glyph back to its full
// multi-character text in the PDF's extractable text layer — copy/paste and
// search then silently drop letters ("confirm" -> "confrm", "traffic" ->
// "trafic"). Disabling the ligature features avoids the substitution
// entirely, which is the safe tradeoff for a document whose text needs to
// stay correct when copied, searched, or read by a screen reader.
//
// fontkit's ShapingPlan#setFeatureOverrides (what pdfkit's `features` option
// ultimately reaches) accepts either an array of tags to *enable*, or an
// object of {tag: boolean} to enable/disable individual ones — @types/pdfkit
// only declares the array-of-tags form (and its own TextOptions/
// OpenTypeFeatures types aren't resolvable from here regardless), so this
// whole shim is kept loosely typed rather than fought into pdfkit's types.
const NO_LIGATURE_FEATURES = { liga: false, clig: false, calt: false, rclt: false };

/**
 * Patches this document's own .text() so every call — regardless of which
 * of pdfkit's four call shapes (text-only, +options, +x/y, +x/y/options) is
 * used anywhere in this file — always carries the no-ligature features,
 * without having to thread that through every individual call site below.
 */
function disableLigatures(doc: PDFKit.PDFDocument) {
  const original = doc.text.bind(doc) as (...args: unknown[]) => PDFKit.PDFDocument;
  const patched = (str: string, ...rest: unknown[]) => {
    if (rest.length === 0) {
      return original(str, { features: NO_LIGATURE_FEATURES });
    }
    if (rest.length === 1) {
      const opts = (rest[0] as Record<string, unknown> | undefined) ?? {};
      return original(str, { ...opts, features: NO_LIGATURE_FEATURES });
    }
    if (rest.length === 2) {
      return original(str, rest[0], rest[1], { features: NO_LIGATURE_FEATURES });
    }
    const opts = (rest[2] as Record<string, unknown> | undefined) ?? {};
    return original(str, rest[0], rest[1], { ...opts, features: NO_LIGATURE_FEATURES });
  };
  (doc as unknown as { text: typeof patched }).text = patched;
}

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

  // font: false skips pdfkit's automatic "Helvetica" load at construction
  // time — that happens before we'd get a chance to register our own safe
  // fallback below, so it would crash regardless of resolveFontSources().
  // @types/pdfkit only declares `font` as `string | undefined`, but pdfkit
  // itself (`if (defaultFont) { this.font(...) }`) happily treats `false`
  // as "skip" at runtime — the type is just incomplete here.
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    font: false as unknown as string,
  });
  const { regular, bold } = resolveFontSources();
  try {
    doc.registerFont(FONT_REGULAR, regular);
    doc.registerFont(FONT_BOLD, bold);
    doc.font(FONT_REGULAR);
  } catch (err) {
    // Both the embedded fallback and the named-font path failed — nothing
    // left to draw text with, so bail out the same way a data-fetch miss
    // above does.
    console.error(`quotePdf: could not initialize a font: ${err instanceof Error ? err.message : err}`);
    return null;
  }
  disableLigatures(doc);
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
    .font(FONT_BOLD)
    .fontSize(20)
    .text(brandName, logoBuffer ? PAGE_MARGIN + 66 : PAGE_MARGIN, 40, { width: contentWidth - 160 });
  doc
    .font(FONT_BOLD)
    .fontSize(22)
    .text("QUOTATION", PAGE_MARGIN, 38, { width: contentWidth, align: "right" });
  doc
    .font(FONT_REGULAR)
    .fontSize(11)
    .text(quote.quote_number, PAGE_MARGIN, 66, { width: contentWidth, align: "right" });

  doc.y = 130;
  doc.fillColor(INK);

  // ---- Bill to / quote details --------------------------------------------
  const colWidth = contentWidth / 2 - 10;
  const infoTop = doc.y;
  doc.font(FONT_BOLD).fontSize(10).fillColor(MUTED).text("BILL TO", PAGE_MARGIN, infoTop);
  doc
    .font(FONT_BOLD)
    .fontSize(12)
    .fillColor(INK)
    .text(customer?.company_name || customer?.contact_name || "Customer", PAGE_MARGIN, infoTop + 14, { width: colWidth });
  doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED);
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
  doc.font(FONT_BOLD).fontSize(10).fillColor(MUTED).text("QUOTE DETAILS", detailsX, infoTop);
  const detailRows: [string, string][] = [
    ["Issue date", formatDate(quote.created_at)],
    ["Valid until", formatDate(quote.expiry_at)],
    ["Status", quote.status.replaceAll("_", " ")],
  ];
  let detailY = infoTop + 14;
  for (const [label, value] of detailRows) {
    doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED).text(label, detailsX, detailY, { width: colWidth / 2, continued: false });
    doc
      .font(FONT_BOLD)
      .fillColor(INK)
      .text(value, detailsX + colWidth / 2, detailY, { width: colWidth / 2, align: "right" });
    detailY += 15;
  }

  doc.y = Math.max(billY, detailY) + 20;

  // ---- Travel details -------------------------------------------------------
  sectionHeading(doc, "Travel Details", brandColor, contentWidth);
  if (legs.length === 0) {
    doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED).text("No journey details recorded.", PAGE_MARGIN);
  }
  legs.forEach((leg, i) => {
    if (legs.length > 1) {
      doc
        .font(FONT_BOLD)
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
  ensureSpace(doc, 44);
  const priceBoxTop = doc.y;
  doc.font(FONT_REGULAR).fontSize(11).fillColor(MUTED).text("Total price", PAGE_MARGIN, priceBoxTop);
  doc
    .font(FONT_BOLD)
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
    doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED).text(version.customer_notes, PAGE_MARGIN, doc.y, { width: contentWidth });
  }

  doc.moveDown(1.2);

  // ---- Terms & conditions -----------------------------------------------------
  sectionHeading(doc, "Terms & Conditions", brandColor, contentWidth);
  const terms = version.terms_snapshot?.trim()
    ? [version.terms_snapshot.trim()]
    : defaultTermsAndConditions(brandName, version.deposit_percentage);
  doc.font(FONT_REGULAR).fontSize(9).fillColor(MUTED);
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
      .font(FONT_REGULAR)
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
  doc.font(FONT_BOLD).fontSize(13).fillColor(color).text(title, PAGE_MARGIN, doc.y, { width });
  doc.moveDown(0.4);
  doc.fillColor(INK);
}

/**
 * Forces a fresh page first if `height` of content wouldn't fit in what's
 * left of the current one. Needed before anything (a background rect, a
 * tight label+value pair) that draws using explicit y-coordinates computed
 * from doc.y and then manually advances doc.y by a fixed amount afterward —
 * pdfkit's own per-line auto page-break can still silently fire mid-way
 * through such a block (each .text() call checks the bottom margin on its
 * own), and once that happens the manual doc.y math after it is left
 * pointing at a stale position from the old page instead of the new one.
 * That produced a real bug: a multi-leg quote whose Pricing section landed
 * near a page's bottom sent the price *value* to a new page while "Total
 * price" stayed managed by page 1, and every section after it inherited the
 * same wrong math — five pages in a row with one stray line of text each.
 */
function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.maxY()) {
    doc.addPage();
  }
}

/** A light grey box of label/value rows — the workhorse layout for travel + pricing details. */
function drawKeyValueBox(doc: PDFKit.PDFDocument, rows: [string, string][], width: number) {
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
  ensureSpace(doc, boxHeight);
  const startY = doc.y;
  doc.rect(PAGE_MARGIN, startY, width, boxHeight).fillOpacity(0.04).fill(INK).fillOpacity(1);

  let y = startY + padding;
  for (const [label, value] of rows) {
    const valueHeight = doc.heightOfString(value, { width: valueWidth });
    doc.font(FONT_REGULAR).fontSize(9).fillColor(MUTED).text(label, PAGE_MARGIN + padding, y, { width: labelWidth });
    doc
      .font(FONT_BOLD)
      .fontSize(10)
      .fillColor(INK)
      .text(value, PAGE_MARGIN + padding + labelWidth, y, { width: valueWidth });
    y += Math.max(valueHeight, 12) + 8;
  }
  doc.y = startY + boxHeight + 4;
}
