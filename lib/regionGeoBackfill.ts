import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionGeoFields } from "@/lib/geoLocate";

/**
 * Classify user regions that predate geography-based routing (0116), or
 * whose earlier lookup never ran. Called lazily from Settings → Users (same
 * "heal on view" pattern as healExpiredQuotes) so existing regions switch to
 * geography routing without a manual script. Unclassified regions keep
 * routing by word match in the meantime, so nothing breaks before this runs.
 *
 * Returns the ids it classified. Silently does nothing if 0116 isn't applied.
 */
export async function classifyPendingRegions(regionIds: string[]): Promise<string[]> {
  if (regionIds.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_regions")
    .select("id, region, lat, lng")
    .in("id", regionIds.slice(0, 200))
    .is("geo_checked_at", null);
  if (error || !data) return [];

  const done: string[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < data.length; i += CONCURRENCY) {
    await Promise.all(
      data.slice(i, i + CONCURRENCY).map(async (r) => {
        const coords = r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
        const geo = await regionGeoFields(r.region, coords);
        const { error: updateError } = await admin.from("user_regions").update(geo).eq("id", r.id);
        if (!updateError) done.push(r.id);
      }),
    );
  }
  return done;
}
