/* ------------------------------------------------------------------
   useEscapeKey

   Wires Escape-key dismissal for modal / sheet / lightbox / popover
   patterns. Replaces ad-hoc `useEffect` + `document.addEventListener`
   in every modal with a single hook call.

   Usage:

     useEscapeKey(open, onClose);

   - When `open` flips true, the hook attaches a window keydown
     listener; on Escape it calls `onClose`.
   - When `open` flips false (or the component unmounts), the listener
     is removed.

   Why a hook (not just inlining the listener):
   - Centralises the WAI-ARIA keyboard-dismiss requirement so the
     pattern is consistent across the app's 9+ modal surfaces.
   - Captures `onClose` via a ref so callers don't have to wrap their
     handler in useCallback to avoid re-attaching the listener on
     every render.
   ------------------------------------------------------------------ */

import { useEffect, useRef } from "react";

export function useEscapeKey(when: boolean, onClose: () => void): void {
  /* Hold the latest onClose in a ref so we can re-attach the listener
     ONLY when `when` changes — re-attaching on every render churns
     event-listener add/remove pairs and is unnecessary. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!when) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [when]);
}
