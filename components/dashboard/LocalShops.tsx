"use client";

import { useState } from "react";

/* ------------------------------------------------------------------
   LocalShops

   Single-row card on the home dashboard. The in-app shop directory
   was retired (no curated partner data, Google Maps removed) — this
   card now hands the user to a Google Maps search in the system
   browser, which has a richer listings UI than we could build
   in-app.

   Find Shops flow:
   1. Open a blank tab synchronously inside the click handler so
      popup blockers don't fire.
   2. Ask the browser for the device's current location via
      `navigator.geolocation`. This uses GPS / WiFi / cell tower
      triangulation — the user's ACTUAL location right now, not
      a saved profile address or Google account home.
   3. On success: redirect the tab to a Google Maps search centered
      on those coords (`/@LAT,LON,13z` form). Works whether the user
      is travelling, signed-in to Google, or not.
   4. On error / denial / 5s timeout: redirect to a `near me` query
      and let Google fall back to its own location heuristics.

   The blank-tab redirect dance is necessary because geolocation is
   async and browsers block `window.open` from async callbacks.
   ------------------------------------------------------------------ */

const FALLBACK_URL =
  "https://www.google.com/maps/search/?api=1&query=cigar+shops+near+me";

const GEOLOCATION_TIMEOUT_MS = 5000;

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

export function LocalShops() {
  const [locating, setLocating] = useState(false);

  function handleFindShops() {
    /* Open a blank tab synchronously — this is the bit that satisfies
       popup blockers. We'll redirect it once we know where the user is.

       Intentionally NOT passing `noopener` here: that flag forces the
       returned WindowProxy to null in modern browsers, which would
       break the redirect dance. We immediately navigate the tab to
       google.com — a trusted destination — so the residual opener
       relationship is acceptable. */
    const newTab = window.open("about:blank", "_blank");
    if (!newTab) {
      /* Popup blocked entirely; fall straight to a same-window navigation
         to the fallback URL so the user still gets something. */
      window.location.href = FALLBACK_URL;
      return;
    }

    if (!("geolocation" in navigator)) {
      newTab.location.href = FALLBACK_URL;
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        newTab.location.href =
          `https://www.google.com/maps/search/cigar+shops/@${latitude},${longitude},13z`;
        setLocating(false);
      },
      () => {
        newTab.location.href = FALLBACK_URL;
        setLocating(false);
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 }
    );
  }

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

      <button
        type="button"
        onClick={handleFindShops}
        disabled={locating}
        style={{
          display:                 "inline-flex",
          alignItems:              "center",
          gap:                     6,
          padding:                 "8px 14px",
          fontFamily:              "var(--font-mono)",
          fontSize:                10.5,
          fontWeight:              600,
          letterSpacing:           "0.18em",
          textTransform:           "uppercase",
          color:                   "var(--gold)",
          background:              "transparent",
          border:                  "1px solid var(--card-border)",
          borderRadius:            4,
          flexShrink:              0,
          minHeight:               44,
          cursor:                  locating ? "default" : "pointer",
          opacity:                 locating ? 0.7 : 1,
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {locating ? "Locating…" : "Find Shops"}
      </button>
    </section>
  );
}
