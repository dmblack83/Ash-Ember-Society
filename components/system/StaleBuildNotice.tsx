"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   StaleBuildNotice — banner prompting reload when the loaded JS
   bundle is older than the currently-deployed build.

   Why this exists
   ───────────────
   ServiceWorkerUpdateNotice catches the case where a new SW
   activates while the tab is open. It does NOT cover the iOS-PWA
   resume case: user backgrounds the app, a deploy ships, user
   returns hours later. The painted DOM is from the old bundle, but
   the SW has already silently updated — no broadcast fires on the
   user's return because activation already happened.

   This notice asks the server for its current commit SHA, compares
   it to the SHA inlined into our bundle at build time, and shows a
   banner if they disagree. It runs on mount, on every resume
   (visibility / pageshow), and every 30 min as a long-tail check.

   What this DOESN'T cover: the case where the JS heap is dead.
   No JS = no fetch = no banner. ResumeHandler's sessionStorage
   heartbeat is the other half of that story.
   ------------------------------------------------------------------ */

const POLL_INTERVAL_MS = 30 * 60 * 1000;
/* Persists the server commit the user already dismissed, so clicking
   Reload doesn't immediately re-show the banner for the same deploy
   even if the navigation cache couldn't be refreshed in time. Cleared
   automatically when a newer deploy ships (different server commit). */
const DISMISSED_COMMIT_KEY = "ae:stale-build-dismissed-commit";

export function StaleBuildNotice() {
  const [stale, setStale] = useState(false);
  const serverCommitRef = useRef<string | null>(null);

  useEffect(() => {
    /* Built-in SHA inlined at build time. Undefined in local dev
       (Vercel only injects this in their CI), where we skip the
       check entirely — dev builds don't have a meaningful version
       to compare against. */
    const myCommit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
    if (!myCommit) return;

    let cancelled = false;

    async function check() {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data: { commit: string | null } = await res.json();
        if (cancelled) return;
        if (data.commit && data.commit !== myCommit) {
          try {
            const dismissed = localStorage.getItem(DISMISSED_COMMIT_KEY);
            if (dismissed === data.commit) return;
          } catch { /* private mode — fail open */ }
          serverCommitRef.current = data.commit;
          setStale(true);
        }
      } catch {
        /* network errors are non-actionable here */
      }
    }

    function onResume() {
      if (document.visibilityState === "visible") check();
    }

    check();
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    const timer = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, []);

  if (!stale) return null;

  async function handleReload() {
    setStale(false);
    if (serverCommitRef.current) {
      try { localStorage.setItem(DISMISSED_COMMIT_KEY, serverCommitRef.current); } catch {}
    }
    try { await caches.delete("navigations"); } catch { /* non-fatal */ }
    window.location.reload();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[70] card animate-slide-up flex items-center gap-3 bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6"
      style={{
        left:       "calc(var(--app-content-left) + 1rem)",
        right:      "1rem",
        borderLeft: "4px solid var(--primary)",
        maxWidth:   480,
        margin:     "0 auto",
        padding:    "12px 16px",
      }}
    >
      <span
        style={{
          flex:     1,
          fontSize: 14,
          color:    "var(--foreground)",
          minWidth: 0,
        }}
      >
        A new version is available.
      </span>
      <button
        type="button"
        onClick={handleReload}
        style={{
          padding:      "6px 14px",
          borderRadius: 8,
          background:   "var(--primary)",
          color:        "var(--background)",
          fontSize:     13,
          fontWeight:   600,
          border:       "none",
          cursor:       "pointer",
          flexShrink:   0,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Reload
      </button>
    </div>
  );
}
