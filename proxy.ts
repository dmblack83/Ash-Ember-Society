import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { trackReliability } from "@/lib/telemetry/reliability";

const AUTH_SESSION_TIMEOUT_MS = 3000;

function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__TIMEOUT__"> {
  return Promise.race([
    p,
    new Promise<"__TIMEOUT__">((resolve) =>
      setTimeout(() => resolve("__TIMEOUT__"), ms),
    ),
  ]);
}

/*
 * Paths the proxy will never gate behind authentication or onboarding.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password", // request a reset link; reachable while logged out
  // NB: /reset-password is intentionally NOT public — it must stay gated so
  // only the session minted by the recovery link (via /auth/callback) reaches it.
  "/offline",       // SW navigation fallback; must be reachable without a session
  "/auth/callback",
  "/manifest.webmanifest",
  "/privacy",       // referenced by Google OAuth consent screen + landing footer
  "/terms",         // referenced by Google OAuth consent screen + landing footer
  "/eula",          // end user license agreement — public legal doc
  "/api/stripe/webhook", // protected by Stripe signature, not session
  "/api/youtube",   // protected by SYNC_SECRET header, not session
  "/api/news",      // protected by SYNC_SECRET / CRON_SECRET, not session
  "/api/cron",      // protected by CRON_SECRET header, not session
  "/api/version",   // public deploy SHA health-check; no PII, polled by StaleBuildNotice on every mount including logged-out landing
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

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/*
 * JWKS for local JWT verification.
 *
 * jwtVerify() validates the signature locally against keys fetched once from
 * Supabase's public JWKS endpoint and cached for the lifetime of the module.
 * No Supabase Auth network call occurs for tokens that are still valid.
 *
 * The only code path that calls Supabase Auth is the expired-token fallback
 * below — which fires at most once per user per ~1 hour — versus the previous
 * getSession()/getUser() approach that made a network call on every request.
 */
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

// Derived the same way @supabase/supabase-js derives it from the project URL.
const PROJECT_REF       = new URL(SUPABASE_URL).hostname.split(".")[0];
const AUTH_COOKIE_KEY   = `sb-${PROJECT_REF}-auth-token`;
const BASE64URL_PREFIX  = "base64-";

/*
 * Decode a base64url string to a UTF-8 JavaScript string.
 * Works in both Node.js and Edge runtimes (no Buffer dependency).
 */
function fromBase64url(str: string): string {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes  = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/*
 * Extract the Supabase access token (a JWT) from the request cookies.
 *
 * @supabase/ssr 0.9.x stores the session JSON as a base64url-encoded value
 * prefixed with "base64-", split into 3 180-byte chunks when the value is too
 * large for a single cookie.
 */
function extractTokenFromCookies(request: NextRequest): string | null {
  let raw = request.cookies.get(AUTH_COOKIE_KEY)?.value ?? null;

  if (!raw) {
    const parts: string[] = [];
    for (let i = 0; ; i++) {
      const chunk = request.cookies.get(`${AUTH_COOKIE_KEY}.${i}`)?.value;
      if (!chunk) break;
      parts.push(chunk);
    }
    if (parts.length > 0) raw = parts.join("");
  }

  if (!raw) return null;

  const jsonStr = raw.startsWith(BASE64URL_PREFIX)
    ? fromBase64url(raw.slice(BASE64URL_PREFIX.length))
    : raw;

  try {
    return (JSON.parse(jsonStr) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

interface VerifiedUser {
  id:                  string;
  email:               string | undefined;
  onboardingCompleted: boolean;
}

export async function proxy(request: NextRequest) {
  /*
   * Strip any client-supplied x-ae-* headers immediately. We re-add the
   * verified values below if (and only if) identity is confirmed.
   */
  const forwardHeaders = new Headers(request.headers);
  for (const h of FORWARDED_USER_HEADERS) forwardHeaders.delete(h);

  /*
   * supabaseResponse is only written to in the expired-token fallback path.
   * It carries any Set-Cookie headers written during a token refresh so the
   * refreshed session cookie reaches the browser.
   */
  let supabaseResponse = NextResponse.next({ request: { headers: forwardHeaders } });
  let user: VerifiedUser | null = null;

  const token = extractTokenFromCookies(request);

  if (token) {
    try {
      // Fast path: JWKS verification with no Supabase Auth network call.
      const { payload } = await jwtVerify(token, JWKS);
      if (payload.sub) {
        const meta = payload["user_metadata"] as Record<string, unknown> | undefined;
        user = {
          id:                  payload.sub,
          email:               payload["email"] as string | undefined,
          onboardingCompleted: Boolean(meta?.onboarding_completed),
        };
      }
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        // Slow path: access token expired — delegate to Supabase for a single
        // refresh network call. Fires at most once per user per ~1 hour.
        const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
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
        });
        const sessionResult = await raceWithTimeout(
          supabase.auth.getSession(),
          AUTH_SESSION_TIMEOUT_MS,
        );
        if (sessionResult === "__TIMEOUT__") {
          trackReliability({
            bucket:  "auth_session",
            subtype: "proxy_auth_timeout",
            cause:   "getSession_3s",
            extra:   { timeout_ms: AUTH_SESSION_TIMEOUT_MS },
          });
        } else {
          const session = sessionResult.data.session;
          if (session?.user) {
            user = {
              id:                  session.user.id,
              email:               session.user.email,
              onboardingCompleted: Boolean(
                session.user.user_metadata?.onboarding_completed
              ),
            };
          }
        }
      } else {
        // Bad signature, malformed token, JWKS fetch fail, etc. → user stays null.
        trackReliability({
          bucket:  "auth_session",
          subtype: "jwt_verify_fail",
          cause:   err instanceof Error ? err.name : "unknown",
          detail:  err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const { pathname } = request.nextUrl;

  // ── 1. Unauthenticated → protected route ──────────────────────────────
  // Only redirect HTML navigation requests to /login — API calls and RSC
  // fetches (Accept: text/x-component, application/json, */*) return 401
  // instead of a redirect so an auth timeout can't interrupt an in-flight
  // client-side action (e.g. posting to the lounge).
  if (!user && !isPublic(pathname)) {
    const accept = request.headers.get("accept") ?? "";
    const isNavigation = accept.includes("text/html");
    if (!isNavigation) {
      return new NextResponse(null, { status: 401 });
    }
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
    const { onboardingCompleted } = user;

    // ── 2. Authenticated on a public auth page ─────────────────────────
    if (isPublicAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = onboardingCompleted ? "/home" : "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // ── 3. Authenticated but onboarding incomplete ─────────────────────
    // /privacy and /terms are exempt so users can read the policies
    // without being bounced back to onboarding mid-read.
    if (
      !onboardingCompleted &&
      pathname !== "/onboarding" &&
      !pathname.startsWith("/onboarding/") &&
      pathname !== "/privacy" &&
      pathname !== "/terms" &&
      pathname !== "/eula"
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
    forwardHeaders.set("x-ae-onboarding-completed", onboardingCompleted ? "1" : "0");

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
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|workbox-.*\\.js|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
