import { AccordionCard } from "@/components/discover/AccordionCard";

/* Force dynamic rendering. This page is auth-gated by proxy.ts; if
   Next prerenders it at build time, unauthenticated fetches (e.g.,
   Serwist's precache crawler) get a 307 redirect to /login and break
   downstream consumers of the prerender manifest. See #365 for the
   incident. Page itself fetches no per-user data, so the cost is the
   render alone. */
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
   Content page

   Server-rendered shell. The AccordionCard children need client
   interactivity (open/close state) and live in their own client
   file. Keeping the page server-side is what allows the `dynamic`
   export above.
   ------------------------------------------------------------------ */

export default function ContentPage() {
  return (
    <div className="max-w-2xl mx-auto" style={{ padding: "24px 16px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section header */}
      <div style={{ marginBottom: 8 }}>
        <h1
          style={{
            fontSize:   22,
            fontWeight: 700,
            fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          Content
        </h1>
        <p
          style={{
            fontSize:  14,
            color:     "var(--muted-foreground)",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          Videos and product reviews curated for the aficionado.
        </p>
      </div>

      <AccordionCard title="Videos" />
      <AccordionCard title="Product Reviews" />
    </div>
  );
}
