"use client";

import { useEffect } from "react";

/* ------------------------------------------------------------------
   PersistentStorageRequest

   Asks the browser to make this origin's Cache Storage + IndexedDB
   persistent. Persistent storage is NOT auto-evicted when the device
   is under memory or quota pressure. Non-persistent storage IS — and
   iOS is famously aggressive about evicting it.

   We've already taken hits from cache eviction this session
   (re-installs needed because the SW + its caches got wiped). This
   reduces the chance of that happening to active users.

   Behavior by browser:
   - iOS Safari standalone PWA  : auto-granted, no prompt
   - iOS Safari browser tab     : returns false (declined)
   - Chrome / Edge              : auto-granted if engagement signals
                                  are present (notifications enabled,
                                  bookmarked, installed, etc.)
   - Firefox                    : may show a permission prompt

   Worst case: returns false and we keep the default non-persistent
   storage. There's nothing to "undo" — calling persist() is safe.

   Mounted in app/(app)/layout.tsx so we only request after the user
   is authenticated — that's the engagement signal that says "this
   user is committed enough to warrant persistence."
   ------------------------------------------------------------------ */

const MARK_PERSIST_REQUEST  = "ae:storage-persist-request";
const MARK_PERSIST_RESOLVED = "ae:storage-persist-resolved";
const MEASURE_PERSIST       = "ae:storage-persist-duration";

function safeMark(name: string) {
  if (typeof performance !== "undefined" && performance.mark) {
    try { performance.mark(name); } catch { /* ignore */ }
  }
}

function safeMeasure(name: string, start: string, end: string) {
  if (typeof performance !== "undefined" && performance.measure) {
    try { performance.measure(name, start, end); } catch { /* ignore */ }
  }
}

export function PersistentStorageRequest() {
  useEffect(() => {
    if (typeof navigator === "undefined")           return;
    if (!navigator.storage || !navigator.storage.persist) return;

    let cancelled = false;

    /* Wrap in async IIFE so we can await sequentially. The persisted()
       check first avoids re-requesting on every page navigation if
       the browser already granted us persistence on a prior visit. */
    (async () => {
      try {
        const already = await navigator.storage.persisted();
        if (cancelled || already) return;

        safeMark(MARK_PERSIST_REQUEST);
        const granted = await navigator.storage.persist();
        if (cancelled) return;
        safeMark(MARK_PERSIST_RESOLVED);
        safeMeasure(MEASURE_PERSIST, MARK_PERSIST_REQUEST, MARK_PERSIST_RESOLVED);

        /* Lightweight visibility — strip if it becomes noisy. iOS
           standalone PWAs typically log `true`; Safari tabs typically
           log `false`. Either way it's diagnostic, not an error. */
        console.log(`[storage] persist() → ${granted}`);
      } catch (err) {
        /* persist() can reject in some browsers (e.g., the user
           denied a Firefox prompt). Non-fatal. */
        console.warn("[storage] persist() failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
