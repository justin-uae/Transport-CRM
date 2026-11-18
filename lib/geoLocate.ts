import "server-only";

/**
 * Geography for lead routing (0116_geo_lead_routing.sql). route_lead() used
 * to match a user's region name as a word inside the lead's address text,
 * so a "China" region missed "Grand Hyatt Shanghai" because the word
 * "China" never appears. Now each lead endpoint and each user region is
 * resolved through Google once, and the trigger compares country codes /
 * admin areas / distance instead. Everything here fails open (returns null)
 * — the trigger then falls back to the old text match, so a Google outage
 * degrades routing to the previous behaviour rather than breaking intake.
 *
 * Uses the same key as lib/reverseGeocode.ts and lib/tripDistance.ts.
 */

type AddressComponent = { long_name: string; short_name: string; types: string[] };

export interface GeoPlace {
  /** ISO 3166-1 alpha-2, e.g. "CN". */
  countryCode: string | null;
  /** First-level admin area in English, e.g. "Scotland", "New York". */
  adminArea: string | null;
  lat: number;
  lng: number;
  /** Google result types for the top match (e.g. ["country","political"]). */
  types: string[];
}

const TIMEOUT_MS = 5000;

function apiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
}

function fromComponents(components: AddressComponent[], lat: number, lng: number, types: string[]): GeoPlace {
  const country = components.find((c) => c.types.includes("country"));
  const admin = components.find((c) => c.types.includes("administrative_area_level_1"));
  return {
    countryCode: country?.short_name?.toUpperCase() ?? null,
    adminArea: admin?.long_name ?? null,
    lat,
    lng,
    types,
  };
}

async function geocodeApi(text: string, key: string): Promise<GeoPlace | null> {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?language=en&address=${encodeURIComponent(text)}&key=${encodeURIComponent(key)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: string;
    results?: { types: string[]; address_components: AddressComponent[]; geometry: { location: { lat: number; lng: number } } }[];
  };
  const top = data.results?.[0];
  if (!top) return null;
  return fromComponents(top.address_components, top.geometry.location.lat, top.geometry.location.lng, top.types);
}

/** Places Text Search (New) — copes with free text like "hotel near the Eiffel Tower" that the Geocoding API rejects. */
async function placesTextSearch(text: string, key: string): Promise<GeoPlace | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.location,places.addressComponents,places.types",
    },
    body: JSON.stringify({ textQuery: text, languageCode: "en", pageSize: 1 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    places?: {
      location?: { latitude: number; longitude: number };
      types?: string[];
      addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
    }[];
  };
  const top = data.places?.[0];
  if (!top?.location) return null;
  const components: AddressComponent[] = (top.addressComponents ?? []).map((c) => ({
    long_name: c.longText ?? "",
    short_name: c.shortText ?? c.longText ?? "",
    types: c.types ?? [],
  }));
  return fromComponents(components, top.location.latitude, top.location.longitude, top.types ?? []);
}

/** Resolve free text to a place: Geocoding API first, Places Text Search as a fallback. Null on any failure. */
export async function locateText(text: string | null | undefined): Promise<GeoPlace | null> {
  const clean = text?.trim();
  const key = apiKey();
  if (!clean || clean.length < 2 || !key) return null;
  try {
    return (await geocodeApi(clean, key)) ?? (await placesTextSearch(clean, key));
  } catch (err) {
    console.error(`locateText failed for "${clean}":`, err);
    return null;
  }
}

/**
 * Columns to spread into a leads insert so route_lead() can route by
 * geography. Both endpoints are looked up in parallel; a failed lookup just
 * leaves that side null (text-match fallback in the trigger).
 */
export async function leadGeoFields(pickup: string | null | undefined, destination: string | null | undefined) {
  const [p, d] = await Promise.all([locateText(pickup), locateText(destination)]);
  return {
    pickup_country_code: p?.countryCode ?? null,
    pickup_admin_area: p?.adminArea ?? null,
    pickup_lat: p?.lat ?? null,
    pickup_lng: p?.lng ?? null,
    destination_country_code: d?.countryCode ?? null,
    destination_admin_area: d?.adminArea ?? null,
    destination_lat: d?.lat ?? null,
    destination_lng: d?.lng ?? null,
  };
}

async function countryAt(lat: number, lng: number): Promise<{ code: string; name: string } | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?language=en&result_type=country&latlng=${lat},${lng}&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { address_components: AddressComponent[] }[] };
    const c = data.results?.[0]?.address_components.find((a) => a.types.includes("country"));
    return c ? { code: c.short_name.toUpperCase(), name: c.long_name } : null;
  } catch {
    return null;
  }
}

export type RegionGeoType ="country" | "admin_area" | "locality";

/** Types that are too vague or not a real area to route by — those regions keep the text match. */
const UNROUTABLE_TYPES = ["continent", "colloquial_area", "natural_feature"];

/**
 * Classify a user region for routing:
 * - country ("China") → any lead in that country
 * - admin_area ("Scotland, UK") → any lead in that first-level area
 * - locality (a city, district, airport…) → leads within radius_km of it
 * - null → can't place it (e.g. "Caribbean"); routing keeps the word match
 */
export async function regionGeoFields(region: string, coords?: { lat: number; lng: number } | null) {
  const place = await locateText(region);
  const checked = { geo_checked_at: new Date().toISOString() };
  if (place && place.types.some((t) => UNROUTABLE_TYPES.includes(t))) {
    // Google reads some country names as a landmass ("Ireland" = the island).
    // Accept it as a country only when the country at that point carries
    // exactly the region's name — "Caribbean" etc. still fall through.
    const country = await countryAt(place.lat, place.lng);
    if (country && country.name.toLowerCase() === region.trim().toLowerCase()) {
      return { geo_type: "country" as const, country_code: country.code, admin_area: null, ...checked };
    }
  }
  if (!place || !place.countryCode || place.types.some((t) => UNROUTABLE_TYPES.includes(t))) {
    return { geo_type: null, country_code: null, admin_area: null, ...checked };
  }
  if (place.types.includes("country")) {
    return { geo_type: "country" as const, country_code: place.countryCode, admin_area: null, ...checked };
  }
  if (place.types.includes("administrative_area_level_1") && place.adminArea) {
    return { geo_type: "admin_area" as const, country_code: place.countryCode, admin_area: place.adminArea, ...checked };
  }
  return {
    geo_type: "locality" as const,
    country_code: place.countryCode,
    admin_area: place.adminArea,
    lat: coords?.lat ?? place.lat,
    lng: coords?.lng ?? place.lng,
    ...checked,
  };
}
