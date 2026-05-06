import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ViewportMeta } from "@/components/ui/ViewportMeta";
import { RegisterServiceWorker } from "@/components/ui/RegisterServiceWorker";
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

export const metadata: Metadata = {
  title: "Ash & Ember Society",
  description: "A premium cigar enthusiast experience.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ash & Ember",
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
            __html: "html,body{background-color:#1A1210;}",
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
        {/* Vercel Speed Insights — captures real-user LCP/CLS/INP/FCP/TTFB
            from production traffic. Free tier covers ~10K data points/mo
            on Hobby, 25K on Pro. Disabled automatically in dev. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
