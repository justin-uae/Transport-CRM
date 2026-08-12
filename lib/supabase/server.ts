import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * RLS-scoped Supabase client for use in Server Components, Server Actions
 * and Route Handlers. Reads/writes the auth session via Next.js cookies, so
 * every query runs as the signed-in user and is subject to RLS policies.
 *
 * NEXT_PUBLIC_AUTH_COOKIE_DOMAIN (optional) scopes the session cookie to a
 * shared parent domain (e.g. "globalbusrental.com") instead of the exact
 * host it was set on — without it, signing in on the supplier portal's host
 * (SUPPLIER_PORTAL_HOST, a different subdomain from the main app) produces a
 * cookie the main CRM domain never sees, so a cross-domain redirect lands
 * back on the login page instead of an authenticated session. NEXT_PUBLIC_
 * prefixed (read here too, not just from the browser client) so both this
 * server client and lib/supabase/client.ts's browser client — and
 * proxy.ts's own inline client — always agree on the same value.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const cookieDomain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component that can't set cookies — the
            // middleware refreshes the session on the next request instead.
          }
        },
      },
    },
  );
}
