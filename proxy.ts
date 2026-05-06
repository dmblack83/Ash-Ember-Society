import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Paths the proxy will never gate behind authentication or onboarding.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/offline",       // SW navigation fallback; must be reachable without a session
  "/auth/callback",
  "/manifest.webmanifest",
  "/manifest.json",
  "/api/youtube",   // protected by SYNC_SECRET header, not session
  "/api/news",      // protected by SYNC_SECRET / CRON_SECRET, not session
];

/*
 * Headers the proxy uses to forward the verified user identity to downstream
 * route handlers and server components. Always stripped from incoming requests
 * to prevent client spoofing.
 */
const FORWARDED_USER_HEADERS = [
  "x-ae-user-id",
  "x-ae-user-email",
  "x-ae-onboarding-completed",
] as const;

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
   * Strip any client-supplied x-ae-* headers immediately. We re-add the
   * verified values below if (and only if) Supabase confirms the session.
   */
  const forwardHeaders = new Headers(request.headers);
  for (const h of FORWARDED_USER_HEADERS) forwardHeaders.delete(h);

  /*
   * supabaseResponse must be the object we return so that any Set-Cookie
   * headers written by the Supabase client (session refresh) are forwarded.
   * Never discard or replace it after setAll has run — copy its cookies onto
   * a new response if you need to attach more request headers afterward.
   */
  let supabaseResponse = NextResponse.next({ request: { headers: forwardHeaders } });

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
          supabaseResponse = NextResponse.next({ request: { headers: forwardHeaders } });
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
   *
   * Race against a 3-second timeout. If Supabase Auth is slow or down,
   * a hung await on every request would block the entire document
   * response — the browser shows a blank/dark screen indefinitely
   * (see warm-resume hang investigation).
   *
   * 3 s is ~10× the median getUser response. On the slow path we
   * fall through with `user = null` — the protected-route check
   * below redirects to /login, where the user can re-auth. Annoying
   * but recoverable; an indefinite hang is not.
   *
   * The `user_metadata` shape we read below ([] / Record) survives
   * a null user via the `!user` guards in branches 1, 1b, and 2.
   */
  const AUTH_TIMEOUT_MS = 3000;
  type AuthResult = Awaited<ReturnType<typeof supabase.auth.getUser>>;
  const authResult = await Promise.race<AuthResult>([
    supabase.auth.getUser(),
    new Promise<AuthResult>((resolve) =>
      setTimeout(() => {
        console.warn(
          `[proxy] supabase.auth.getUser() exceeded ${AUTH_TIMEOUT_MS}ms; ` +
          `treating request as unauthenticated.`,
        );
        // Cast: the timeout branch only needs to satisfy the
        // shape getUser() returns on no-session. error is filled
        // so downstream code that branches on it stays consistent
        // with the real "no user" path.
        resolve({
          data: { user: null },
          error: { name: "AuthTimeout", message: "Auth lookup timed out" },
        } as unknown as AuthResult);
      }, AUTH_TIMEOUT_MS),
    ),
  ]);
  const { data: { user } } = authResult;

  const { pathname } = request.nextUrl;

  // ── 1. Unauthenticated → protected route ──────────────────────────────
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── 1b. Unauthenticated on landing with a stale auth cookie → /login ──
  // Previously signed-in users whose session expired (or never refreshed
  // because the PWA was suspended) shouldn't see the marketing landing.
  // Detect leftover Supabase auth cookies and bounce to /login so they can
  // reauthenticate. Fresh visitors with no cookie still see the landing.
  if (!user && pathname === "/") {
    // Supabase splits the auth token across chunked cookies (`...auth-token`,
    // `...auth-token.0`, `...auth-token.1`), so match any prefix.
    const hasStaleAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    if (hasStaleAuthCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user) {
    const onboardingComplete = Boolean(
      (user.user_metadata as Record<string, unknown>)?.onboarding_completed
    );

    // ── 2. Authenticated on a public auth page ─────────────────────────
    if (isPublicAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = onboardingComplete ? "/home" : "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // ── 3. Authenticated but onboarding incomplete ─────────────────────
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

    /*
     * Forward the verified identity. Server components and route handlers
     * read these via getServerUser() instead of calling auth.getUser()
     * themselves — eliminating ~30 redundant Supabase round-trips per
     * authenticated page load.
     */
    forwardHeaders.set("x-ae-user-id", user.id);
    if (user.email) forwardHeaders.set("x-ae-user-email", user.email);
    forwardHeaders.set("x-ae-onboarding-completed", onboardingComplete ? "1" : "0");

    const enriched = NextResponse.next({ request: { headers: forwardHeaders } });
    for (const c of supabaseResponse.cookies.getAll()) enriched.cookies.set(c);
    return enriched;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except Next.js internals and static assets.
     * _next/data routes are intentionally NOT excluded — they carry RSC
     * payloads and must be protected the same way their page routes are.
     *
     * `monitoring` is the Sentry tunnel route (configured in next.config.ts
     * via `tunnelRoute`). It proxies Sentry SDK events through our origin
     * to bypass ad blockers; must NOT be auth-gated or it breaks error
     * reporting for the very requests that need it most.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|manifest\\.json|sw\\.js|workbox-.*\\.js|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
