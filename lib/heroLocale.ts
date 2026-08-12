import "server-only";
import { headers } from "next/headers";

export interface HeroJobPreview {
  from: string;
  to: string;
  currency: string;
  price: number;
}

// Illustrative sample data for the "New job offer" mockup in the /join hero
// — a well-known city pair and a round, plausible payout figure per market,
// purely to make the preview feel local. Not real fares.
const COUNTRY_PREVIEWS: Record<string, HeroJobPreview> = {
  AE: { from: "Dubai", to: "Abu Dhabi", currency: "AED", price: 850 },
  SA: { from: "Riyadh", to: "Jeddah", currency: "SAR", price: 1400 },
  QA: { from: "Doha", to: "Al Wakrah", currency: "QAR", price: 620 },
  KW: { from: "Kuwait City", to: "Al Ahmadi", currency: "KWD", price: 65 },
  BH: { from: "Manama", to: "Riffa", currency: "BHD", price: 55 },
  OM: { from: "Muscat", to: "Sohar", currency: "OMR", price: 70 },
  EG: { from: "Cairo", to: "Alexandria", currency: "EGP", price: 4200 },
  JO: { from: "Amman", to: "Petra", currency: "JOD", price: 180 },
  GB: { from: "London", to: "Manchester", currency: "GBP", price: 480 },
  IE: { from: "Dublin", to: "Cork", currency: "EUR", price: 420 },
  DE: { from: "Berlin", to: "Munich", currency: "EUR", price: 560 },
  FR: { from: "Paris", to: "Lyon", currency: "EUR", price: 520 },
  ES: { from: "Madrid", to: "Barcelona", currency: "EUR", price: 540 },
  IT: { from: "Rome", to: "Milan", currency: "EUR", price: 500 },
  NL: { from: "Amsterdam", to: "Rotterdam", currency: "EUR", price: 300 },
  PT: { from: "Lisbon", to: "Porto", currency: "EUR", price: 380 },
  CH: { from: "Zurich", to: "Geneva", currency: "CHF", price: 600 },
  TR: { from: "Istanbul", to: "Ankara", currency: "TRY", price: 6500 },
  US: { from: "New York", to: "Boston", currency: "USD", price: 650 },
  CA: { from: "Toronto", to: "Ottawa", currency: "CAD", price: 620 },
  AU: { from: "Sydney", to: "Melbourne", currency: "AUD", price: 780 },
  NZ: { from: "Auckland", to: "Hamilton", currency: "NZD", price: 340 },
  IN: { from: "Delhi", to: "Agra", currency: "INR", price: 8500 },
  PK: { from: "Karachi", to: "Lahore", currency: "PKR", price: 45000 },
  ZA: { from: "Johannesburg", to: "Pretoria", currency: "ZAR", price: 1800 },
  NG: { from: "Lagos", to: "Ibadan", currency: "NGN", price: 65000 },
  KE: { from: "Nairobi", to: "Mombasa", currency: "KES", price: 32000 },
  MA: { from: "Casablanca", to: "Marrakech", currency: "MAD", price: 2800 },
  CN: { from: "Shanghai", to: "Hangzhou", currency: "CNY", price: 1200 },
  JP: { from: "Tokyo", to: "Yokohama", currency: "JPY", price: 45000 },
  SG: { from: "Singapore", to: "Johor Bahru", currency: "SGD", price: 380 },
  MY: { from: "Kuala Lumpur", to: "Malacca", currency: "MYR", price: 850 },
};

const DEFAULT_PREVIEW: HeroJobPreview = { from: "Dubai", to: "Abu Dhabi", currency: "AED", price: 850 };

/**
 * Best-effort visitor country from the client IP (x-forwarded-for, set by
 * Render's proxy same as everywhere else this app reads it — see
 * lib/audit.ts). Server-side only, cached per-IP for a day so repeat visits
 * from the same address don't re-hit the lookup API, and fully
 * fail-soft — any lookup problem just falls back to the default preview
 * rather than affecting the page.
 */
export async function getHeroJobPreview(): Promise<HeroJobPreview> {
  try {
    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!ip || ip === "127.0.0.1" || ip === "::1") return DEFAULT_PREVIEW;

    const response = await fetch(`https://ipapi.co/${ip}/country/`, {
      signal: AbortSignal.timeout(1500),
      next: { revalidate: 86400 },
    });
    if (!response.ok) return DEFAULT_PREVIEW;

    const countryCode = (await response.text()).trim().toUpperCase();
    return COUNTRY_PREVIEWS[countryCode] ?? DEFAULT_PREVIEW;
  } catch {
    return DEFAULT_PREVIEW;
  }
}
