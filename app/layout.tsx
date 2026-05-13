import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";

/* Supabase API + Storage origin for resource-hint preconnect.
   Read at module load — process.env.NEXT_PUBLIC_SUPABASE_URL is
   inlined into the bundle by Next at build time. URL parse is safe
   because the env var is required for the app to function. */
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ViewportMeta } from "@/components/ui/ViewportMeta";
import { RegisterServiceWorker } from "@/components/ui/RegisterServiceWorker";
import { ServiceWorkerUpdateNotice } from "@/components/system/ServiceWorkerUpdateNotice";
import { SWRProvider } from "@/components/SWRProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ColdOpenSmoke, COLD_SMOKE_INIT_SCRIPT } from "@/components/cold-open-smoke/ColdOpenSmoke";
import { STALE_CHUNK_RECOVERY_SCRIPT } from "@/components/system/stale-chunk-recovery";
import { HydrationMark } from "@/components/system/HydrationMark";
import { HYDRATION_WATCHDOG_SCRIPT } from "@/components/system/hydration-watchdog";
import "./globals.css";

/*
 * Playfair Display — the editorial serif for headings, the brand name,
 * and anywhere the lounge-menu feel is needed.
 */
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

/*
 * Inter — clean, readable sans-serif for body copy and UI elements.
 * At small sizes it stays crisp in the dark environment.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* Viewport is managed separately from metadata in Next.js 16.
   maximum-scale=1 prevents iOS from zooming when inputs are focused.
   ViewportMeta (client component) removes the restriction on desktop
   and injects interactive-widget=resizes-content for Android. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/* iOS launch (splash) images. iOS shows these in the window between
   icon-tap and the first HTML paint — the exact gap that produced
   multi-second white screens on PWA cold-launch / warm-resume after
   iOS evicted the WebView. Each entry pairs one of our pre-generated
   `public/appstore-images/ios-splash/<width>x<height>.png` images
   with the media query iOS uses to pick it. Mismatched-resolution
   splashes are ignored by iOS (falls back to white), so the device
   dimensions in `device-width`/`device-height` + the matching pixel
   ratio MUST be exact.

   Generation: `python3 scripts/generate-ios-splash.py`. Re-run after
   any logo or brand-color change. */
const iosSplash = (deviceW: number, deviceH: number, dpr: 2 | 3, orientation: "portrait" | "landscape" = "portrait") => {
  const w = orientation === "portrait" ? deviceW * dpr : deviceH * dpr;
  const h = orientation === "portrait" ? deviceH * dpr : deviceW * dpr;
  return {
    url:   `/appstore-images/ios-splash/${w}x${h}.png`,
    media: `(device-width: ${deviceW}px) and (device-height: ${deviceH}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`,
  };
};

export const metadata: Metadata = {
  title: "Ash & Ember Society",
  description: "A premium cigar enthusiast experience.",
  /* Next 16 maps `appleWebApp.capable: true` to the new W3C
     `mobile-web-app-capable` tag and stopped emitting the legacy
     Apple-prefixed `apple-mobile-web-app-capable`. iOS still
     requires the apple-prefixed form to:
       1. Enable PWA standalone mode at install
       2. Honor any apple-touch-startup-image splash references
       3. Allow Web Push subscriptions from the home-screen icon
     Without it, iOS treats the install as a regular browser
     shortcut, ignores the splash images entirely, falls back to a
     white WebView startup, and breaks push notifications.
     Setting it explicitly via `other` puts the tag back in the
     head alongside Next's W3C-standard one. */
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ash & Ember",
    startupImage: [
      /* iPhones — portrait. Listed largest to smallest so iOS picks
         the most specific match (it evaluates top-down). */
      iosSplash(430, 932, 3),  // 15 Pro Max, 14 Pro Max
      iosSplash(428, 926, 3),  // 14 Plus
      iosSplash(393, 852, 3),  // 15 Pro, 14 Pro
      iosSplash(414, 896, 3),  // 11 Pro Max, XS Max
      iosSplash(414, 896, 2),  // 11, XR
      iosSplash(390, 844, 3),  // 14, 13, 13 Pro, 12, 12 Pro
      iosSplash(375, 812, 3),  // 13 mini, 12 mini, 11 Pro, XS, X
      iosSplash(414, 736, 3),  // 8 Plus, 7 Plus, 6S Plus
      iosSplash(375, 667, 2),  // 8, 7, 6S, 6, SE (2/3)
      iosSplash(320, 568, 2),  // SE (1st gen), 5S, 5
      /* iPads — portrait. */
      iosSplash(1024, 1366, 2), // Pro 12.9"
      iosSplash(834, 1194, 2),  // Pro 11"
      iosSplash(820, 1180, 2),  // Air 10.9"
      iosSplash(810, 1080, 2),  // 10.2"
      iosSplash(744, 1133, 2),  // mini (6th gen)
      iosSplash(768, 1024, 2),  // 9.7", mini (older)
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
     * suppressHydrationWarning is required by next-themes: it adds a class
     * to <html> on the client before hydration, which would otherwise cause
     * a mismatch warning.
     *
     * Font variables are injected here so they're available to the
     * @theme inline mapping in globals.css:
     *   --font-serif → var(--font-playfair)
     *   --font-sans  → var(--font-inter)
     */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${playfairDisplay.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Resource hints — preconnect to origins used on every
            authenticated request. Each saves the DNS+TCP+TLS handshake
            (~100–300ms on cold mobile) when the actual fetch fires.
            crossOrigin="anonymous" matches the CORS mode of Supabase
            REST/Auth fetches. ytimg is dns-prefetch only (less critical;
            images on Discover Channels and burn-report linked videos). */}
        {SUPABASE_ORIGIN && (
          <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
        )}
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        {/*
         * Inline brand-background style — emitted in <head> so the
         * parser applies it BEFORE external CSS loads. Without this,
         * cold launch and warm-resume show ~2-4s of default-white
         * body while globals.css is in flight. The dark colour
         * matches the manifest background_color and the design-token
         * --background value; keep them in sync.
         *
         * Why a literal hex instead of var(--background):
         * the CSS custom property is defined in globals.css; if we
         * referenced it here it would be undefined until that sheet
         * loads — exactly the state we're trying to bridge.
         */}
        <style
          dangerouslySetInnerHTML={{
            __html: "html,body{background-color:#15110b;}",
          }}
        />
        {/* Stale-chunk recovery — captures `error` events from the
            very first <script>/<link> tags Next emits, so a stale
            SW cache pointing at deleted /_next/static/ chunks after
            a deploy auto-recovers (cache nuke + SW unregister +
            reload) instead of hanging forever. Rate-limited to two
            cache-bust attempts per session. See file for details. */}
        <script dangerouslySetInnerHTML={{ __html: STALE_CHUNK_RECOVERY_SCRIPT }} />
        {/* Cold-smoke init — runs synchronously at parse time so the
            overlay (rendered server-side below) is visible from the
            very first frame on cold PWA launch. No flash of dashboard. */}
        <script dangerouslySetInnerHTML={{ __html: COLD_SMOKE_INIT_SCRIPT }} />
        {/* Hydration watchdog — starts a 15s timer at parse time;
            forces ONE reload if `window.__AE_HYDRATED` isn't set
            by then. Catches silent hydration crashes / hangs that
            don't surface as a chunk-load 404. <HydrationMark/> in
            <body> sets the flag in a useEffect. */}
        <script dangerouslySetInnerHTML={{ __html: HYDRATION_WATCHDOG_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Skip-link — keyboard users can jump past page chrome to
            the main content. Visually hidden until focused, then
            appears as a focusable button at the top-left. Targets
            #main-content which is set on each route group's <main>
            element ((app)/layout.tsx, (auth)/layout.tsx, and the
            landing page's main). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded focus:bg-foreground focus:text-background focus:font-medium focus:shadow-lg"
        >
          Skip to main content
        </a>
        {/* HydrationMark cancels the watchdog timer in <head> the
            moment React reaches its first useEffect — proof that
            the page is alive. Without this, the watchdog reloads
            after 15s assuming a hung hydration. */}
        <HydrationMark />
        {/* SWRProvider wraps the entire app so any client component can
            useSWR(...) and share one cache. Conservative defaults live
            in components/SWRProvider.tsx — see comment block there. */}
        <SWRProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <ColdOpenSmoke />
            {children}
          </ThemeProvider>
        </SWRProvider>
        {/* Patches viewport meta on desktop; resets scroll on iOS focusout */}
        <ViewportMeta />
        {/* Registers /sw.js (production only) so the app is PWA-installable */}
        <RegisterServiceWorker />
        {/* Surfaces a non-blocking "Update available — Reload" banner
            when a new SW activates under an open tab. Prevents the
            stale-chunk window where the user's loaded JS doesn't
            match the new build's chunk URLs. */}
        <ServiceWorkerUpdateNotice />
        {/* Vercel Speed Insights — captures real-user LCP/CLS/INP/FCP/TTFB
            from production traffic. Free tier covers ~10K data points/mo
            on Hobby, 25K on Pro. Disabled automatically in dev. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
