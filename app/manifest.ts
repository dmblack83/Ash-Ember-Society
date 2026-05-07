import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    /* `id` is the canonical app identity. Without it, browsers fall
       back to `start_url` — meaning any future change to start_url
       would be treated as a NEW app (re-prompt to install, lost
       notification subscriptions, separate icon). With id pinned to
       "/", start_url can change freely. NEVER change this once shipped. */
    id:               "/",

    /* `scope` defines the URL space the PWA controls. Without it,
       Chrome scopes to start_url's directory ("/home/"), which is
       narrower than the SW's actual control. "/" matches the SW
       registration scope. */
    scope:            "/",

    name:             "Ash & Ember Society",
    short_name:       "Ash & Ember",
    description:      "The premium cigar enthusiast app",
    start_url:        "/home",
    display:          "standalone",
    background_color: "#1A1210",
    theme_color:      "#1A1210",
    orientation:      "portrait",
    /* Locale + writing direction — surfaces in install dialogs and is
       used by some app stores (Microsoft Store / Samsung Galaxy Store)
       to filter listings. */
    lang:             "en",
    dir:              "ltr",
    /* Categories drive store-level discovery / filtering. Pick the
       two closest fits — cigar enthusiast app sits at lifestyle +
       social. */
    categories:       ["lifestyle", "social"],
    /* Quick-action shortcuts shown on long-press of the home-screen
       icon (Android) and right-click of the dock icon (Chrome desktop).
       Three high-frequency entry points that are NOT the start_url. */
    shortcuts: [
      {
        name:        "New Burn Report",
        short_name:  "Burn Report",
        description: "Log a smoke from your humidor",
        url:         "/humidor",
        icons:       [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name:        "Open Humidor",
        short_name:  "Humidor",
        description: "View your collection",
        url:         "/humidor",
        icons:       [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name:        "Open Lounge",
        short_name:  "Lounge",
        description: "See the community feed",
        url:         "/lounge",
        icons:       [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src:   "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type:  "image/png",
      },
      {
        src:   "/icons/icon-192.png",
        sizes: "192x192",
        type:  "image/png",
      },
      /* The 512 icon is registered TWICE with different purposes —
         W3C allows "any maskable" as a single space-separated value
         but Next's MetadataRoute.Manifest type only accepts one
         purpose per entry. Functionally identical: same file used
         for both non-maskable contexts (favicon, install prompt
         header) AND maskable contexts (Android adaptive icon).
         Without the "any" entry, browsers fall back to icon-192
         for non-maskable contexts — losing visual fidelity. */
      {
        src:     "/icons/icon-512.png",
        sizes:   "512x512",
        type:    "image/png",
        purpose: "any",
      },
      {
        src:     "/icons/icon-512.png",
        sizes:   "512x512",
        type:    "image/png",
        purpose: "maskable",
      },
    ],
  };
}
