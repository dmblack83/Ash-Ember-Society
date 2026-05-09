"use client";

/* ------------------------------------------------------------------
   OfflineBanner

   Subtle top-pinned strip that appears when the device goes offline
   and disappears on reconnect. Sets expectations: when the SW is
   serving cached HTML, users couldn't otherwise tell whether what
   they see is fresh or stale, or whether their next form submit
   will actually save.

   Intentionally NOT dismissible — the connectivity state is the
   source of truth; if the user X's out, they might forget they're
   offline and lose work to a silently-failing save.

   Mounted from app/(app)/layout.tsx (authenticated app surfaces
   only). Marketing landing visitors don't have anything to save,
   so the message would be off-key there. /login and /signup are
   currently uncovered — file as follow-up if offline auth attempts
   become a real support thread.

   Accessibility:
   - role="status" + aria-live="polite" — screen readers announce
     the change but don't interrupt; the banner is informational.
   - Safe-area padding on top matches the iOS PWA notch inset so
     the banner sits below the status bar in standalone mode.
   ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";

/* `useSyncExternalStore` is the React-idiomatic way to subscribe to
   browser APIs that sit outside the component tree. Replaces the old
   `useState + useEffect` pattern that triggered the React Compiler's
   set-state-in-effect warning. SSR returns false (we can't know);
   hydration immediately reads the real navigator.onLine. */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online",  callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online",  callback);
    window.removeEventListener("offline", callback);
  };
}

function getOfflineSnapshot(): boolean {
  return !navigator.onLine;
}

function getOfflineServerSnapshot(): boolean {
  return false;
}

export function OfflineBanner() {
  const isOffline = useSyncExternalStore(
    subscribeOnline,
    getOfflineSnapshot,
    getOfflineServerSnapshot,
  );

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:        "fixed",
        top:             0,
        left:            "var(--app-content-left)",
        right:           0,
        zIndex:          50,
        backgroundColor: "rgba(61, 46, 35, 0.96)",
        color:           "var(--foreground, #F5E6D3)",
        borderBottom:    "1px solid var(--gold, #D4A04A)",
        backdropFilter:  "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        paddingTop:      "calc(env(safe-area-inset-top) + 8px)",
        paddingBottom:   8,
        paddingLeft:     16,
        paddingRight:    16,
        textAlign:       "center",
        fontSize:        13,
        fontWeight:      500,
        letterSpacing:   "0.01em",
      }}
    >
      You&rsquo;re offline — recent changes may not save until you reconnect.
    </div>
  );
}
