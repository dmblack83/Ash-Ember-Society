"use client";

import { useState } from "react";

/* ------------------------------------------------------------------
   LocalShops

   Single-row card on the home dashboard. The in-app shop directory
   was retired (no curated partner data, Google Maps removed) — this
   card now hands the user to a Google Maps search in the system
   browser, which has a richer listings UI than we could build
   in-app.

   Find Shops flow (rev #350):
   1. Await `navigator.geolocation.getCurrentPosition` BEFORE opening
      anything. This uses the device's actual GPS / WiFi / cell tower
      triangulation — the user's location right now, not a saved
      profile address or Google account home.
   2. Build the final URL: precise coords (`/@LAT,LON,13z` form) on
      success, `near me` query on denial / timeout / no-geolocation.
   3. Open the final URL in a new tab via `window.open`. Modern
      browsers preserve "transient activation" for ~5s after a click,
      so this still satisfies popup blockers in the common case
      (permission already granted → geolocation resolves in <100ms).
   4. If `window.open` returns null (transient activation expired
      because the user took >5s to grant permission first time, OR
      strict popup blocker), fall back to a same-window navigation.

   Why this shape (and not the prior "open blank tab, then redirect"):
   in iOS PWA standalone mode, `window.open` hands off the new tab
   to system Safari, and the WindowProxy we hold becomes
   cross-context — silent failure when we try to redirect it.
   Building the URL up front and opening it once eliminates the
   redirect step entirely.
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

    setLocating(false);

    /* Try a new tab first — preferred UX, keeps the PWA alive in the
       background. Modern browsers preserve transient activation for
       ~5s after a click, so this works when geolocation resolves
       quickly (permission cached). If `window.open` is blocked
       because activation expired (user took >5s to grant permission
       on first run, OR strict popup blocker), navigate the current
       window instead — guaranteed to work, but the user leaves the
       PWA. Acceptable trade for actually getting them to the right
       map. */
    const opened = window.open(url, "_blank");
    if (!opened) window.location.href = url;
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
