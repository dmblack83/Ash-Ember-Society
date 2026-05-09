import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { createHash } from "node:crypto";

import { COLD_SMOKE_INIT_SCRIPT }      from "./components/cold-open-smoke/cold-smoke-init";
import { STALE_CHUNK_RECOVERY_SCRIPT } from "./components/system/stale-chunk-recovery";
import { HYDRATION_WATCHDOG_SCRIPT }   from "./components/system/hydration-watchdog";

/* ------------------------------------------------------------------
   CSP — script hash computation.

   Each inline <script> in app/layout.tsx must be hashed for the CSP
   `script-src` directive. Hash is over the EXACT script body (no
   wrapping <script> tags). If the script content changes, the hash
   updates automatically because we import the same constants the
   layout uses.
   ------------------------------------------------------------------ */
function sha256Hash(content: string): string {
  return `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;
}

const SCRIPT_HASHES = [
  sha256Hash(STALE_CHUNK_RECOVERY_SCRIPT),
  sha256Hash(COLD_SMOKE_INIT_SCRIPT),
  sha256Hash(HYDRATION_WATCHDOG_SCRIPT),
].join(" ");

/* ------------------------------------------------------------------
   Content Security Policy directives.

   Now in enforcement mode (`Content-Security-Policy`). Originally
   shipped as `Content-Security-Policy-Report-Only` so Sentry could
   surface violations without breaking pages; the report-only window
   completed clean and the policy is now enforced.

   Directive choices:
   - script-src: hash-pinned for the 3 inline scripts; no unsafe-eval
     or unsafe-inline. Strictest part of the policy — XSS protection
     lives here.
   - style-src 'unsafe-inline': Tailwind v4 + React inline style props
     ship CSS we can't hash. Acceptable tradeoff; CSS injection is
     much lower-impact than script injection.
   - connect-src: every backend the app talks to. If a violation
     fires here, add the origin to this list.
   - frame-src: Stripe payment iframes + Google sign-in (OAuth).
   - frame-ancestors 'none': clickjacking protection.
   ------------------------------------------------------------------ */
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${SCRIPT_HASHES}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com https://images.unsplash.com https://media.istockphoto.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.ingest.sentry.io https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-src https://js.stripe.com https://*.stripe.com https://*.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/* Security headers that apply to every response, regardless of CSP. */
const SECURITY_HEADERS = [
  /* CSP back in Report-Only after the brief enforcement window in
     #326 broke RSC. Next 16 streams the Flight payload as inline
     <script> tags whose content is generated per-request, so a
     hash-pinned `script-src 'self' <hashes>` rejects them and the
     React client surfaces "Connection closed" when the stream
     stops. The correct enforce-mode policy needs nonce-based
     script-src or `'strict-dynamic'`; that's a real piece of work,
     not a header-name flip. Keep Report-Only until that lands. */
  { key: "Content-Security-Policy-Report-Only", value: CSP },
  /* Two-year HSTS with subdomains and preload eligibility. Caller
     can submit to https://hstspreload.org once the domain is stable. */
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  /* Disable MIME-type sniffing on responses. */
  { key: "X-Content-Type-Options", value: "nosniff" },
  /* Legacy clickjacking protection. frame-ancestors in CSP is the
     modern equivalent — keep both for older browsers. */
  { key: "X-Frame-Options", value: "DENY" },
  /* Send referrer cross-origin only as the bare origin (no path /
     query). Same-origin sends full URL — useful for analytics. */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /* Disable surface API access we don't use; allow the ones we do.
     camera=(self) for cigar band scanner; geolocation=(self) for
     shop finder. microphone explicitly denied. */
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  /*
   * Tree-shake well-known barrel-export packages so unused exports
   * don't get pulled into client bundles.
   *
   * Next 16 already auto-optimizes lucide-react, date-fns, recharts
   * (full default list at next/dist/docs/.../optimizePackageImports.md)
   * — only add packages that aren't covered by the default.
   *
   * framer-motion is a barrel that ships ~100KB even when only
   * `motion` and `AnimatePresence` are used. The transform here
   * resolves named imports to deep paths and lets Turbopack drop
   * the rest. Used today only on the marketing landing.
   */
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // User-uploaded photos served from Supabase Storage public buckets
        // (cigar-photos, post-images, avatars, ...).
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        // YouTube video thumbnails surfaced in Discover Channels and
        // burn-report linked videos.
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        // Landing-page hero image. Served through next/image so the
        // optimizer picks viewport-appropriate variants in WebP/AVIF.
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        // Landing-page philosophy section image. Same reason as Unsplash.
        hostname: "media.istockphoto.com",
      },
    ],
    /*
     * Format negotiation. AVIF first — ~30% smaller than WebP at
     * comparable quality on supported browsers (~95% of traffic).
     * Next.js still falls back to WebP for browsers that don't accept
     * AVIF, and the original format for the long tail.
     */
    formats: ["image/avif", "image/webp"],
    /*
     * Quality allowlist. Next 16 defaults to `[75]` only — any other
     * `quality={...}` value silently snaps to the nearest allowed one.
     *   60 — dark, low-contrast cigar wrapper photography (lists / catalog).
     *   70 — secondary surfaces (avatars, small thumbnails).
     *   75 — default for everything else (lounge feed, detail heroes,
     *        editorial). Higher values were tried in the codebase but
     *        were already snapping to 75; we keep that behavior.
     */
    qualities: [60, 70, 75],
  },
  async redirects() {
    return [
      {
        source:      "/dashboard",
        destination: "/home",
        permanent:   true,
      },
    ];
  },
  async headers() {
    /*
     * Long-lived cache headers on static metadata.
     *
     * Default for /public assets is `public, max-age=0, must-revalidate`,
     * which forces a conditional GET on every page load. For files that
     * change rarely (icons, the manifest, default cigar art, field-guide
     * illustrations), that's pure Edge Request waste.
     *
     * 1 day for the manifest itself (so PWA metadata edits propagate
     * within a day). 30 days for everything else; bumping these files
     * when we ship new ones means renaming or hashing the path.
     */
    const oneDay   = 60 * 60 * 24;
    const oneMonth = oneDay * 30;
    const monthCache = `public, max-age=${oneMonth}, immutable`;

    return [
      {
        // The service worker file itself MUST never be long-cached, or
        // browsers will run a stale SW for up to a year and breakage
        // becomes near-impossible to ship a fix for. Per Google's PWA
        // guidance, no-cache + must-revalidate is the safe default.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type",  value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: `public, max-age=${oneDay}, must-revalidate` },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: monthCache }],
      },
      {
        source: "/field-guide/:path*",
        headers: [{ key: "Cache-Control", value: monthCache }],
      },
      {
        // path-to-regexp doesn't match spaces in source patterns; use the
        // URL-encoded form so the rule applies to the request as the
        // browser actually sends it.
        source: "/Cigar%20Default%20Images/:path*",
        headers: [{ key: "Cache-Control", value: monthCache }],
      },
      {
        /* Security headers — applied to every response. The CSP
           directive only enforces on HTML responses; browsers ignore
           it on non-HTML, but no harm in serving it everywhere. */
        source:  "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

/* ------------------------------------------------------------------
   Sentry — production error tracking + source map upload.

   withSentryConfig adds a webpack plugin that uploads source maps
   to Sentry at build time. Requires SENTRY_AUTH_TOKEN, SENTRY_ORG,
   SENTRY_PROJECT in the build env. Without those, the plugin
   silently skips upload — runtime error capture still works, but
   Sentry shows minified stack traces.

   tunnelRoute proxies Sentry events through our own domain so ad
   blockers don't drop them. Adds one route (/monitoring) that
   forwards to ingest.sentry.io. The path is excluded from proxy.ts
   matcher so it doesn't trigger auth checks.

   widenClientFileUpload includes more chunks in source map upload
   (default scope misses some App Router chunks).

   silent suppresses build-time logging except in CI.
   ------------------------------------------------------------------ */
export default withSentryConfig(nextConfig, {
  org:                    process.env.SENTRY_ORG,
  project:                process.env.SENTRY_PROJECT,
  authToken:              process.env.SENTRY_AUTH_TOKEN,
  silent:                 !process.env.CI,
  widenClientFileUpload:  true,
  tunnelRoute:            "/monitoring",
  /* Tree-shake Sentry's debug logger out of production bundles.
     Replaces the deprecated `disableLogger: true` per the SDK's
     migration guidance. webpack-only — Turbopack ignores this option
     today, so the actual bundle effect is conditional on bundler
     choice. Listed here for forward compatibility and to silence the
     `disableLogger is deprecated` build warning. */
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
