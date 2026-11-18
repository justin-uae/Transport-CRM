import "server-only";

export interface TripDistance {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Real driving distance/duration between two addresses via Google's
 * Routes API — grounds the AI price estimate (lib/aiPriceEstimate.ts,
 * lib/aiAutoQuote.ts) in an actual number instead of asking the model to
 * guess both the geography AND the price from two address strings alone,
 * which is what made repeated estimates for the same unchanged trip swing
 * wildly (e.g. MXN 25,000 on one call, MXN 4,500 on the very next). Returns
 * null on any failure (no key, API error, no route found, addresses too
 * vague to resolve) so the caller falls back to an ungrounded estimate
 * rather than the whole feature breaking — same fail-open pattern as
 * lib/reverseGeocode.ts, which already uses this same key server-side.
 */
export interface RouteSegment {
  from: string;
  to: string;
  distance: TripDistance | null;
}

export interface RouteDistance {
  segments: RouteSegment[];
  /** Null when any segment couldn't be resolved — a partial sum would understate the trip. */
  total: TripDistance | null;
}

type LatLng = { latitude: number; longitude: number };

/** Stops are resolved to coordinates before routing — see resolveStops. */
type ResolvedStop = { text: string; at: LatLng | null };

const TIMEOUT_MS = 6000;
/** A hop longer than this (straight line) triggers the context pass in resolveStops. */
const SUSPICIOUS_HOP_KM = 300;
const BIAS_RADIUS_M = 50000;

function apiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
}

function straightKm(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function pathKm(points: (LatLng | null)[]) {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) km += straightKm(a, b);
  }
  return km;
}

// Page views (lead, quote, dispatch, supplier job) recompute the same legs
// over and over — cache resolutions and routes in-process for a few hours.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 1000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const value = make();
  // Don't keep failures (null) around — the next view retries.
  value.then((v) => {
    if (v == null) cache.delete(key);
  });
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Places Text Search (New): free text -> coordinates, optionally preferring results near `near`. */
function findPlace(text: string, near: LatLng | null): Promise<LatLng | null> {
  const key = apiKey();
  if (!key) return Promise.resolve(null);
  const cacheKey = `place|${text.toLowerCase()}|${near ? `${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}` : ""}`;
  return cached(cacheKey, async () => {
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location" },
        body: JSON.stringify({
          textQuery: text,
          languageCode: "en",
          pageSize: 1,
          ...(near ? { locationBias: { circle: { center: near, radius: BIAS_RADIUS_M } } } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error("tripDistance findPlace: Places API returned", res.status, (await res.text()).slice(0, 300));
        return null;
      }
      const data = (await res.json()) as { places?: { location?: LatLng }[] };
      return data.places?.[0]?.location ?? null;
    } catch (err) {
      console.error(`tripDistance findPlace failed for "${text}":`, err);
      return null;
    }
  });
}

/**
 * Turn a trip's stops into coordinates, using the trip itself as context.
 * Looked up one by one, a vague stop can land on the wrong continent —
 * "Bergamo hotel" alone is a hotel called Bergamo in Yerevan, so Bergamo
 * Airport → "Bergamo hotel" came out as 3,679 km. When any hop looks
 * suspiciously long, each stop in turn is taken as the anchor and the
 * others are re-searched near it; the reading with the shortest overall
 * path wins. Bias is only a preference, so genuinely distant, well-named
 * stops ("London" → "Paris") resolve exactly as before.
 */
async function resolveStops(stops: string[]): Promise<ResolvedStop[]> {
  const plain = await Promise.all(stops.map((s) => findPlace(s, null)));
  const suspicious = plain.some((p, i) => {
    const prev = i > 0 ? plain[i - 1] : null;
    return !!p && !!prev && straightKm(prev, p) > SUSPICIOUS_HOP_KM;
  });
  if (stops.length < 2 || !suspicious) return stops.map((text, i) => ({ text, at: plain[i] ?? null }));

  let best = plain;
  let bestKm = pathKm(plain);
  for (let anchor = 0; anchor < stops.length; anchor++) {
    const center = plain[anchor];
    if (!center) continue;
    const candidate = await Promise.all(stops.map((s, i) => (i === anchor ? Promise.resolve(center) : findPlace(s, center))));
    if (candidate.some((c, i) => !c && plain[i])) continue;
    const km = pathKm(candidate);
    if (km < bestKm) {
      best = candidate;
      bestKm = km;
    }
  }
  return stops.map((text, i) => ({ text, at: best[i] ?? null }));
}

function waypoint(stop: ResolvedStop) {
  return stop.at ? { location: { latLng: stop.at } } : { address: stop.text };
}

function routeBetween(from: ResolvedStop, to: ResolvedStop): Promise<TripDistance | null> {
  const key = apiKey();
  if (!key) return Promise.resolve(null);
  const cacheKey = `route|${JSON.stringify(waypoint(from))}|${JSON.stringify(waypoint(to))}`;
  return cached(cacheKey, async () => {
    // Routes API (computeRoutes), not the legacy Distance Matrix API, which
    // Google no longer enables on new Cloud projects. The key's project needs
    // "Routes API" and "Places API (New)" enabled.
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({ origin: waypoint(from), destination: waypoint(to), travelMode: "DRIVE" }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error("estimateTripDistance: Routes API returned", res.status, (await res.text()).slice(0, 300));
        return null;
      }
      const data = (await res.json()) as { routes?: { distanceMeters?: number; duration?: string }[] };
      const route = data.routes?.[0];
      // duration comes back as seconds in a string, e.g. "1843s"; a zero-length
      // route (same place twice) omits distanceMeters entirely.
      const seconds = route?.duration ? parseFloat(route.duration) : NaN;
      if (!route || !Number.isFinite(seconds)) return null;
      return {
        distanceKm: Math.round(((route.distanceMeters ?? 0) / 1000) * 10) / 10,
        durationMinutes: Math.round(seconds / 60),
      };
    } catch (err) {
      console.error("estimateTripDistance failed:", err);
      return null;
    }
  });
}

/**
 * Stop-by-stop driving distance along an ordered list of stops (A→B, B→C, …)
 * — used for a leg with via points or a multi-leg journey, where a single
 * pickup→destination figure would hide the real route. All stops are
 * resolved together so each one is read in the context of the others.
 */
export async function estimateRouteDistance(stops: (string | null)[]): Promise<RouteDistance> {
  const clean = stops.map((s) => s?.trim() ?? "").filter(Boolean);
  if (clean.length < 2) return { segments: [], total: null };
  const resolved = await resolveStops(clean);
  const segments = await Promise.all(
    resolved.slice(1).map(async (to, i) => ({ from: clean[i]!, to: clean[i + 1]!, distance: await routeBetween(resolved[i]!, to) })),
  );
  const total =
    segments.length > 0 && segments.every((s) => s.distance)
      ? {
          distanceKm: Math.round(segments.reduce((sum, s) => sum + s.distance!.distanceKm, 0) * 10) / 10,
          durationMinutes: segments.reduce((sum, s) => sum + s.distance!.durationMinutes, 0),
        }
      : null;
  return { segments, total };
}

/**
 * One stop-by-stop route distance per leg (pickup → via points →
 * destination), index-aligned with `legs` — what every page showing
 * JourneyLegDetail passes as its `distance` prop (lead, quote, new-quote,
 * dispatch job, supplier job).
 */
export function legRouteDistances(
  legs: { pickup_address: string; destination_address: string; via_points: string[] | null }[],
): Promise<RouteDistance[]> {
  return Promise.all(
    legs.map((leg) => estimateRouteDistance([leg.pickup_address, ...(leg.via_points ?? []), leg.destination_address])),
  );
}

export async function estimateTripDistance(pickup: string | null, destination: string | null): Promise<TripDistance | null> {
  if (!apiKey() || !pickup?.trim() || !destination?.trim()) return null;
  return (await estimateRouteDistance([pickup, destination])).total;
}
