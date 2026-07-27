import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile, Supplier } from "./supabase/database.types";

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

/**
 * Loads the signed-in supplier's row — the supplier-portal equivalent of
 * requireProfile(). A supplier account has no `profiles` row at all (it's a
 * separate identity space, see 0003_operations.sql); redirects to /login if
 * there's no session or no matching supplier.
 */
export async function requireSupplier(): Promise<Supplier> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: supplier, error } = await supabase.from("suppliers").select("*").eq("id", user.id).single();

  if (error || !supplier) {
    redirect("/login");
  }

  if (supplier.status === "suspended" || supplier.status === "rejected") {
    await supabase.auth.signOut();
    redirect("/login?reason=account_disabled");
  }

  return supplier;
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
