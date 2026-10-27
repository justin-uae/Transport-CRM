import "server-only";
import { headers } from "next/headers";
import geoip from "geoip-country";
import { getGbpRates } from "./fxRates";

/**
 * Local-currency pricing on the customer's quote page (app/q/[token]).
 *
 * A quote is recorded in one currency (whatever the salesperson or AI priced
 * it in). A customer opening it abroad sees every amount converted into their
 * own currency, worked out from their IP address, and pays by card in that
 * currency — the payment is still recorded against the quote in its own
 * currency (see createStripeCheckoutAction / the Stripe webhook), so
 * balances stay exact. Bank transfers stay in the quote's currency, since
 * the bank details are per currency.
 *
 * The IP lookup is the offline GeoLite2 country database bundled in
 * geoip-country — no visitor IP is sent to a third-party service.
 */

/** Visitor's IP — Render (and most proxies) put the original client first in X-Forwarded-For. */
async function visitorIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

/** The visitor's local currency from their IP, or null when it can't be told (local/private IP, unknown range). */
export async function detectVisitorCurrency(): Promise<string | null> {
  const ip = await visitorIp();
  if (!ip) return null;
  try {
    return geoip.lookup(ip)?.currency?.[0] ?? null;
  } catch {
    return null;
  }
}

export interface DisplayCurrency {
  /** What the page shows prices in and charges cards in. */
  currency: string;
  /** Multiply an amount in the quote's own currency by this to get `currency`. 1 when they're the same. */
  rate: number;
  /** True when this is a conversion from the quote's currency. */
  converted: boolean;
}

/**
 * Picks the currency the quote page shows: an explicit choice from the
 * page's own switcher (?currency=) wins, then the visitor's local currency,
 * then the quote's own. Anything the exchange-rate source doesn't know, or
 * a rate lookup failure, falls back to the quote's currency unconverted —
 * never a broken page.
 */
export async function resolveDisplayCurrency(quoteCurrency: string, requested?: string | null): Promise<DisplayCurrency> {
  const base = quoteCurrency.toUpperCase();
  const unconverted = { currency: base, rate: 1, converted: false };
  const wanted = requested?.trim().toUpperCase() || (await detectVisitorCurrency());
  if (!wanted || wanted === base) return unconverted;
  try {
    const rates = await getGbpRates();
    const from = rates[base];
    const to = rates[wanted];
    if (!from || !to) return unconverted;
    return { currency: wanted, rate: to / from, converted: true };
  } catch {
    return unconverted;
  }
}

/** Amount in the quote's currency -> the display currency, rounded to the currency's minor unit (whole units for JPY etc.). */
export function convertForDisplay(amount: number, display: DisplayCurrency): number {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: display.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const factor = 10 ** digits;
  return Math.round(amount * display.rate * factor) / factor;
}
