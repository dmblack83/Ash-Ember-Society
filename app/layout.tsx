import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ViewportMeta } from "@/components/ui/ViewportMeta";
import { RegisterServiceWorker } from "@/components/ui/RegisterServiceWorker";
import { ColdOpenSmoke } from "@/components/cold-open-smoke/ColdOpenSmoke";
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
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ColdOpenSmoke />
          {children}
        </ThemeProvider>
        {/* Patches viewport meta on desktop; resets scroll on iOS focusout */}
        <ViewportMeta />
        {/* Registers /sw.js (production only) so the app is PWA-installable */}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
