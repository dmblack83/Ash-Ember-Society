"use client";

/* ------------------------------------------------------------------
   BurnReportModal

   A fullscreen overlay that hosts the existing VerdictCard for the
   FULL view. Triggered by tapping a BurnReportPreviewCard in the
   Humidor list or Lounge feed.

   Why a modal (not a route)?
   - Preserves the user's scroll position in the underlying feed —
     critical when they're skimming reports and tapping into one.
   - No data refetch round-trip: the parent already has the report
     data loaded, so opening is instant.
   - Body scroll lock prevents the iOS Safari "background scrolls
     under the modal" bug.
   - history.pushState wires the browser back button to "close modal"
     so the gesture users expect (especially on Android) just works.

   The full view route at /lounge/[postId] (or a future Humidor
   equivalent) remains the canonical URL for sharing / deep linking.
   This modal is the same content rendered in-place.
   ------------------------------------------------------------------ */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { VerdictCard, type VerdictCardProps } from "@/components/humidor/VerdictCard";

interface BurnReportModalProps extends VerdictCardProps {
  open:    boolean;
  onClose: () => void;
  /* Optional content rendered below the VerdictCard inside the modal
     (linked video, share/delete row, etc.). The list stays clean —
     all secondary affordances live here. */
  belowCard?: React.ReactNode;
}

export function BurnReportModal({ open, onClose, belowCard, ...verdictProps }: BurnReportModalProps) {
  const mountedRef = useRef(false);

  /* Body scroll lock + browser-back wiring. Enter on open, leave
     on close. We snapshot scrollY before locking so we can restore
     position when the modal closes (iOS scrolls to top otherwise
     when body.position becomes 'fixed'). */
  useEffect(() => {
    if (!open) return;

    /* Push a sentinel history state so the browser back button (or
       Android system back) closes the modal. We tag it so the
       popstate handler can tell our entry apart from a legitimate
       prior page. */
    const sentinel = { __burnReportModal: true };
    window.history.pushState(sentinel, "");

    /*
     * Only close on popstate when our sentinel is no longer the
     * current state — i.e. the user actually backed PAST us.
     *
     * If a child component (e.g. PhotoLightbox) pushed its own
     * sentinel and then popped it, popstate fires with our marker
     * still on top of the stack. Without this guard we'd close the
     * report whenever the photo viewer closed itself — exactly the
     * bug Dave reported with the lightbox close.
     */
    const onPop = () => {
      if (window.history.state?.__burnReportModal !== true) {
        onClose();
      }
    };
    window.addEventListener("popstate", onPop);

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top      = `-${scrollY}px`;
    body.style.width    = "100%";
    body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);

      body.style.position = "";
      body.style.top      = "";
      body.style.width    = "";
      body.style.overflow = "";
      window.scrollTo(0, scrollY);

      /* Pop our sentinel if it's still on the stack. If close was
         triggered by a popstate event, the entry is already gone
         and history.back() would over-pop — guard with state check. */
      if (window.history.state && (window.history.state as { __burnReportModal?: boolean }).__burnReportModal) {
        window.history.back();
      }
    };
  }, [open, onClose]);

  /* SSR portal guard — createPortal needs document.body. */
  useEffect(() => { mountedRef.current = true; }, []);
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position:  "fixed",
        inset:     0,
        zIndex:    9990,
        background: "var(--background)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Close button — sticky top-right, respects safe-area inset. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position:                "fixed",
          top:                     "calc(12px + env(safe-area-inset-top))",
          right:                   "calc(12px + env(safe-area-inset-right))",
          width:                   44,
          height:                  44,
          borderRadius:            "50%",
          border:                  "1px solid var(--line)",
          background:              "var(--card)",
          color:                   "var(--paper-mute)",
          cursor:                  "pointer",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          zIndex:                  10000,
          display:                 "flex",
          alignItems:              "center",
          justifyContent:          "center",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {/* Centered content column at app width. */}
      <div
        style={{
          maxWidth:    560,
          margin:      "0 auto",
          padding:     "calc(16px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))",
        }}
      >
        <VerdictCard {...verdictProps} />
        {belowCard}
      </div>
    </div>,
    document.body,
  );
}
