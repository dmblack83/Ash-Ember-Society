/*
 * Offline fallback page.
 *
 * Served by the service worker when a navigation request fails
 * (the user is offline AND the requested page isn't in cache).
 * Lives at the top level — not in `(app)` — so it bypasses the
 * proxy's auth gate and is reachable without a session.
 *
 * Static, server-component, no data, no client JS. Precached at
 * install time by Serwist (because it's prerendered).
 */

import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "Offline — Ash & Ember Society",
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight:       "100vh",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         "32px 24px",
        background:      "#15110b",
        color:           "#F5E6D3",
        textAlign:       "center",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div
          aria-hidden="true"
          style={{
            height:       1,
            background:   "#D4A04A",
            opacity:      0.5,
            marginBottom: 28,
          }}
        />

        <h1
          style={{
            fontFamily:    "var(--font-serif), Georgia, serif",
            fontSize:      "clamp(28px, 7vw, 36px)",
            fontWeight:    500,
            lineHeight:    1.05,
            letterSpacing: "-0.015em",
            margin:        "0 0 16px",
          }}
        >
          You&rsquo;re offline.
        </h1>

        <p
          style={{
            fontFamily:    "var(--font-serif), Georgia, serif",
            fontStyle:     "italic",
            fontSize:      16,
            color:         "#A69080",
            lineHeight:    1.5,
            margin:        "0 0 32px",
          }}
        >
          The lounge is quiet without a connection. Reconnect, then
          step back in.
        </p>

        {/* prefetch={false} because the user is offline by definition
            when this page renders — we don't want Next firing a doomed
            prefetch request. The click triggers a navigation that the
            SW intercepts: live page if back online, this fallback again
            if still offline. */}
        <Link
          href="/"
          prefetch={false}
          style={{
            display:        "inline-block",
            padding:        "12px 28px",
            borderRadius:   9999,
            background:     "#D4A04A",
            color:          "#1A1210",
            fontWeight:     600,
            fontSize:       14,
            letterSpacing:  "0.04em",
            textTransform:  "uppercase",
            textDecoration: "none",
          }}
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
