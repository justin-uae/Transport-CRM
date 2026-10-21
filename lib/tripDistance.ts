import "server-only";

export interface TripDistance {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Real driving distance/duration between two addresses via Google's
 * Distance Matrix API — grounds the AI price estimate (lib/aiPriceEstimate.ts,
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

/**
 * Stop-by-stop driving distance along an ordered list of stops (A→B, B→C, …)
 * — used for a leg with via points or a multi-leg journey, where a single
 * pickup→destination figure would hide the real route.
 */
export async function estimateRouteDistance(stops: (string | null)[]): Promise<RouteDistance> {
  const clean = stops.map((s) => s?.trim() ?? "").filter(Boolean);
  const pairs = clean.slice(1).map((to, i) => ({ from: clean[i]!, to }));
  const segments = await Promise.all(
    pairs.map(async ({ from, to }) => ({ from, to, distance: await estimateTripDistance(from, to) })),
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !pickup?.trim() || !destination?.trim()) return null;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(pickup)}` +
      `&destinations=${encodeURIComponent(destination)}&mode=driving&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      rows?: { elements?: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[];
    };
    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK" || !element.distance || !element.duration) return null;
    return {
      distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
      durationMinutes: Math.round(element.duration.value / 60),
    };
  } catch (err) {
    console.error("estimateTripDistance failed:", err);
    return null;
  }
}
