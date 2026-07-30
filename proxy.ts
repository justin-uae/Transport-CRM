import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/q" is the token-based customer quote page (Part 55) and
// "/api/leads/website" is the public website lead webhook (Part 22) — both
// authenticate on their own terms (an unguessable token / a per-brand
// shared secret) rather than a Supabase session.
const PUBLIC_PATHS = ["/login", "/reset-password", "/accept-invite", "/auth/confirm", "/q", "/api/leads/website"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Every other branch below only exists to decide (a) whether to bounce an
  // unauthenticated visitor away from a protected path, or (b) whether to
  // bounce an already-signed-in visitor away from /login — neither applies
  // to a public path that isn't /login (the customer quote page, the
  // website lead webhook, reset-password, etc.), so skip the session round
  // trip entirely there instead of paying for it on every request.
  if (isPublic && path !== "/login") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === "/login") {
    // Staff (profiles) and suppliers are separate identity spaces sharing
    // this one login page (0003_operations.sql) — figure out which one this
    // session belongs to so we don't bounce a supplier into /dashboard
    // (which would just redirect them straight back here).
    const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (profile) return NextResponse.redirect(new URL("/dashboard", request.url));

    const { data: supplier } = await supabase.from("suppliers").select("id").eq("id", user.id).maybeSingle();
    if (supplier) return NextResponse.redirect(new URL("/supplier/dashboard", request.url));

    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
