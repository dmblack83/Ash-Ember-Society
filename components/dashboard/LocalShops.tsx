/* ------------------------------------------------------------------
   LocalShops

   Single-row card on the home dashboard. The in-app shop directory
   was retired (no curated partner data, Google Maps removed) — this
   card now hands the user to a Google Maps search in the system
   browser, which uses native location prompts and a much richer
   listings UI than we could build in-app.

   `target="_blank" rel="noopener noreferrer"` opens the system
   browser from the PWA so the user stays in their default Maps app
   on mobile.

   Receives `zip` from the parent island (sourced from the user's
   profile). Embeds it in the Maps query so the search is anchored
   to a specific location. The plain `near me` form previously used
   here resolved to a Google default (Chicago) when opened from an
   iOS standalone PWA, because the new opening context lacked the
   geolocation signal Maps depends on. Explicit ZIP makes the result
   deterministic across every client context.
   ------------------------------------------------------------------ */

function findShopsUrl(zip: string | null): string {
  /* "cigar shops near {ZIP}" reads naturally to Google Maps; it
     returns the same results as a coordinate-anchored search but
     without needing geocoding on our end. URL-encode the query so
     spaces become `+` and any future special characters are safe. */
  const query = zip
    ? `cigar shops near ${zip}`
    : "cigar shops near me";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

export function LocalShops({ zip }: { zip: string | null }) {
  const href = findShopsUrl(zip);
  return (
    <section
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            14,
        padding:        "16px 18px",
        background:     "var(--card-bg)",
        border:         "1px solid var(--card-border)",
        borderRadius:   4,
        boxShadow:      "var(--card-edge)",
      }}
    >
      {/* Circle icon */}
      <div
        aria-hidden="true"
        style={{
          width:        38,
          height:       38,
          borderRadius: "50%",
          border:       "1px solid var(--line)",
          display:      "grid",
          placeItems:   "center",
          color:        "var(--gold)",
          flexShrink:   0,
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
          Within 25 miles
        </div>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            6,
          padding:        "8px 14px",
          fontFamily:     "var(--font-mono)",
          fontSize:       10.5,
          fontWeight:     600,
          letterSpacing:  "0.18em",
          textTransform:  "uppercase",
          color:          "var(--gold)",
          background:     "transparent",
          border:         "1px solid var(--card-border)",
          borderRadius:   4,
          textDecoration: "none",
          flexShrink:     0,
          minHeight:      44,
        }}
      >
        Find Shops
      </a>
    </section>
  );
}
