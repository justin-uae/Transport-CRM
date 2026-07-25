import "server-only";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import type { Brand, Profile } from "./supabase/database.types";

const ACTIVE_BRAND_COOKIE = "gtc_active_brand";

/**
 * Resolves the brand context for the current request: every brand the user
 * is authorised for, and which one is currently active. The active brand
 * drives quote/invoice identity, templates and reporting scope (Part 14) —
 * it is never implicit.
 */
export async function getBrandContext(profile: Profile): Promise<{
  brands: Brand[];
  activeBrandId: string | null;
}> {
  const supabase = await createClient();

  const { data: brandLinks } = await supabase
    .from("user_brands")
    .select("brand_id, brands(*)")
    .eq("user_id", profile.id);

  const brands = (brandLinks ?? [])
    .map((row) => row.brands as unknown as Brand)
    .filter(Boolean);

  const cookieStore = await cookies();
  const cookieBrandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
  const activeBrandId =
    (cookieBrandId && brands.some((b) => b.id === cookieBrandId) ? cookieBrandId : null) ??
    profile.default_brand_id ??
    brands[0]?.id ??
    null;

  return { brands, activeBrandId };
}

export { ACTIVE_BRAND_COOKIE };
