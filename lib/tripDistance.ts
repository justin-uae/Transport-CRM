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
