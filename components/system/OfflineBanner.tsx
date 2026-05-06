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

import { useEffect, useState } from "react";

export function OfflineBanner() {
  /* Initial value is `false` for SSR safety — useEffect updates to
     the real navigator.onLine state on hydration. Brief one-frame
     flicker on cold load if user is offline; acceptable v1. */
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOffline(!navigator.onLine);
    }

    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:        "fixed",
        top:             0,
        left:            0,
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
