"use client";

import { useEffect } from "react";

/*
 * Registers /sw.js on the client. Mounted once at the root layout.
 *
 * - Skips dev (Next dev disables SW anyway, plus we don't want a
 *   stale SW from a hot-reload session sticking around in browsers).
 * - Skips browsers without serviceWorker support (older Safari,
 *   ancient Android, etc.) — silent no-op.
 * - Registers on window load to avoid competing with critical-path
 *   resources during initial paint.
 *
 * The registered worker is intentionally a near-no-op (see
 * public/sw.js). Its only job is to make the app installable so
 * the BeforeInstallPromptEvent fires on Chromium browsers.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Swallow registration errors — SW is best-effort.
        // eslint-disable-next-line no-console
        console.warn("[sw] registration failed:", err);
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
