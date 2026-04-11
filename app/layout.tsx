import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ViewportMeta } from "@/components/ui/ViewportMeta";
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

export const metadata: Metadata = {
  title: "Ash & Ember Society",
  description: "A premium cigar enthusiast experience.",
  manifest: "/manifest.json",
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
        {/* Viewport: maximum-scale=1 prevents iOS auto-zoom on inputs.
            interactive-widget=resizes-content keeps Android's content area
            shrinking (not overlapping) when the software keyboard opens.
            ViewportMeta removes maximum-scale on desktop (≥1024px) so
            pinch-zoom still works there. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-content"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
        {/* Patches viewport meta on desktop; resets scroll on iOS focusout */}
        <ViewportMeta />
      </body>
    </html>
  );
}
