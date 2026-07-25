import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./supabase/database.types";

/**
 * Loads the signed-in user's profile (role, tenant, brand defaults, flags).
 * Redirects to /login if there is no session — call this at the top of any
 * (staff) Server Component/layout that requires auth.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  if (profile.status === "suspended" || profile.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/login?reason=account_disabled");
  }

  return profile;
}

/** Non-redirecting variant for places that can render a fallback instead. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}
