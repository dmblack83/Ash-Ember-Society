import { Cormorant_Garamond } from "next/font/google";

/* Route-scoped Cormorant instance: the landing design uses weight 500/600
   with true italics (gold italic accents in the hero, manifesto, finale).
   The app-wide instance in app/layout.tsx only carries 600/700 normal;
   loading the extra faces here keeps them off every app route. */
const cormorantLanding = Cormorant_Garamond({
  variable: "--font-cormorant-landing",
  weight: ["500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={cormorantLanding.variable}>{children}</div>;
}
