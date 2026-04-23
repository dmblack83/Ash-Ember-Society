import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Paths the proxy will never gate behind authentication or onboarding.
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/callback",
  "/manifest.webmanifest",
  "/manifest.json",
];

function isPublicAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup";
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function proxy(request: NextRequest) {
  /*
   * supabaseResponse must be the object we return so that any Set-Cookie
   * headers written by the Supabase client (session refresh) are forwarded.
   * Never discard or replace it after setAll has run.
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
   * getUser() validates the JWT with the Supabase Auth server and refreshes
   * the session if needed. user.user_metadata comes from auth.users — no
   * extra DB query required to check onboarding status.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── 1. Unauthenticated → protected route ──────────────────────────────
  // Preserve the intended destination so the login page can redirect back.
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    const onboardingComplete = Boolean(
      (user.user_metadata as Record<string, unknown>)?.onboarding_completed
    );

    // ── 2. Authenticated on a public auth page ─────────────────────────
    // Send to onboarding or dashboard depending on whether they've completed it.
    if (isPublicAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = onboardingComplete ? "/dashboard" : "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // ── 3. Authenticated but onboarding incomplete ─────────────────────
    // Gate every app route behind /onboarding. The /onboarding page itself
    // (and /auth/callback) must be excluded to avoid redirect loops.
    if (
      !onboardingComplete &&
      pathname !== "/onboarding" &&
      !pathname.startsWith("/onboarding/")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except Next.js internals and static assets.
     * _next/data routes are intentionally NOT excluded — they carry RSC
     * payloads and must be protected the same way their page routes are.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|manifest\\.json|sw\\.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
