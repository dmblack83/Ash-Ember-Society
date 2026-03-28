import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Paths the proxy will never gate behind authentication.
 * - /login, /signup  — the auth pages themselves
 * - /auth/callback   — Supabase redirect target (code exchange)
 */
const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function proxy(request: NextRequest) {
  /*
   * supabaseResponse is the response we return at the end of this function.
   * It must be the response that is passed to NextResponse.next() so that
   * any Set-Cookie headers written by the Supabase client are forwarded to
   * the browser.  Never replace or discard this object after setAll runs.
   */
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror cookies onto the request first (needed by Server Components
          // that read cookies() in this same request), then onto the response
          // (needed so the browser receives the updated session cookie).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /*
   * getUser() refreshes the session if it has expired and writes the new
   * tokens back via setAll above.  Always call this before any conditional
   * logic — do NOT use getSession() here, its data is unverified.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Auth gate ──────────────────────────────────────────────────────────
  // Unauthenticated user hitting a protected route → send to /login.
  // We preserve the intended destination in `?next=` so the login page
  // can redirect back after a successful sign-in.
  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting an auth page → send to /dashboard.
  // Prevents signed-in users from landing on /login or /signup.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except Next.js internals and static assets.
     * Note: _next/data routes are intentionally NOT excluded — excluding them
     * would leave RSC data fetches unprotected even when the page is protected.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
