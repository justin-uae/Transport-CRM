import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Browser-side Supabase client for use inside Client Components. See lib/supabase/server.ts for what NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is for. */
export function createClient() {
  const cookieDomain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    cookieDomain ? { cookieOptions: { domain: cookieDomain } } : undefined,
  );
}
