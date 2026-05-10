"use client";

import { useState } from "react";

/* ------------------------------------------------------------------
   LocalShops

   Single-row card on the home dashboard. The in-app shop directory
   was retired (no curated partner data, Google Maps removed) — this
   card now hands the user to a Google Maps search in the system
   browser, which has a richer listings UI than we could build
   in-app.

   Find Shops flow (rev #351 — same-window navigation):
   1. Await `navigator.geolocation.getCurrentPosition` to get the
      device's actual GPS / WiFi coords (5s timeout, 60s-stale OK).
   2. Build the URL: precise coords (`/@LAT,LON,13z`) on success,
      `near me` on denial / timeout / no-geolocation.
   3. Navigate the current window via `window.location.href`. NOT
      `window.open` — that triggered a popup blocker prompt in iOS
      PWA standalone because the await on geolocation consumed the
      click's transient activation.

   Trade-off: the PWA loses focus on click (user lands in system
   Safari / Maps app, depending on iOS scope rules for out-of-scope
   navigation). For Find Shops specifically this is expected
   behavior — the user's intent is to look at shops in Maps, not
   stay in the cigar app's webview. After they're done browsing
   shops they re-launch the PWA from the home screen icon.

   Three prior attempts at preserving new-tab UX all broke in iOS
   PWA standalone (#348 silent cross-context redirect, #349 blank
   tab when redirect failed, #350 popup-blocker on async open).
   Same-window nav has no popup blocker because navigations aren't
   subject to it.
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

function getCurrentCoords(): Promise<GeolocationCoordinates | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos)  => resolve(pos.coords),
      ()     => resolve(null),
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 }
    );
  });
}

export function LocalShops() {
  const [locating, setLocating] = useState(false);

  async function handleFindShops() {
    setLocating(true);
    const coords = await getCurrentCoords();
    const url = coords
      ? `https://www.google.com/maps/search/cigar+shops/@${coords.latitude},${coords.longitude},13z`
      : FALLBACK_URL;
    window.location.href = url;
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
