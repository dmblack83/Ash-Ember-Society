import { IntentLink } from "@/components/ui/IntentLink";

/* ------------------------------------------------------------------
   LocalShops

   Single-row card linking to /discover/shops. Server component —
   accepts a pre-fetched count so home/page.tsx can wrap it in the
   same Promise.all batch as everything else.
   ------------------------------------------------------------------ */

interface Props {
  /** Total partner shops; surfaced as "X shops · within 25 miles". */
  shopCount: number;
}

function StorefrontIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M2 7.5L3.2 4h11.6L16 7.5M2 7.5h14M2 7.5v7a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-7M5.5 11h2.5v4M10.5 11h3v3a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LocalShops({ shopCount }: Props) {
  return (
    <IntentLink
      href="/discover/shops"
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            14,
        padding:        "16px 18px",
        border:         "1px solid var(--line-soft)",
        borderRadius:   4,
        textDecoration: "none",
        color:          "var(--foreground)",
        transition:     "border-color 200ms ease, background 200ms ease",
      }}
      className="hover:border-[var(--line)]"
    >
      {/* Circle icon */}
      <div
        aria-hidden="true"
        style={{
          width:          38,
          height:         38,
          borderRadius:   "50%",
          border:         "1px solid var(--line)",
          display:        "grid",
          placeItems:     "center",
          color:          "var(--gold)",
          flexShrink:     0,
        }}
      >
        <StorefrontIcon />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   17,
            lineHeight: 1.1,
            color:      "var(--foreground)",
          }}
        >
          Local Shops
        </div>
        <div
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      10.5,
            color:         "var(--paper-dim)",
            letterSpacing: "0.14em",
            marginTop:     4,
            textTransform: "uppercase",
          }}
        >
          <b style={{ color: "var(--gold)", fontWeight: 500 }}>{shopCount}</b>
          {"  "}{shopCount === 1 ? "shop" : "shops"} · within 25 miles
        </div>
      </div>

      <span
        aria-hidden="true"
        style={{
          color:    "var(--paper-dim)",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ›
      </span>
    </IntentLink>
  );
}
