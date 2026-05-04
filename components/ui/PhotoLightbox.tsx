"use client";

import { useEffect, useState } from "react";
import { createPortal }        from "react-dom";
import Image                   from "next/image";

/* ------------------------------------------------------------------
   PhotoLightbox

   Fullscreen photo viewer with prev/next navigation. Used by burn-
   report views (humidor list, lounge feed, post detail) to inspect
   uploaded photos without leaving the surrounding card.

   z-index sits at 11000 / 11001 — explicitly above the
   BurnReportModal close button (10000) so its own X actually
   captures the tap. Earlier inline implementations sat at 9999 and
   the BurnReportModal X bled through; users tapping the photo's X
   would close the entire burn report.

   Multi-image:
   - urls.length === 1 hides the prev/next/counter chrome.
   - urls.length > 1 shows arrows on the sides, a "X / Y" counter
     centred at the bottom, and ←/→ keyboard navigation.

   Behaviour:
   - Click the dimmed backdrop → close.
   - Click the image itself → no-op (e.stopPropagation on the wrapper).
   - Esc → close.
   - ←/→ → previous / next (only when multiple images).
   ------------------------------------------------------------------ */

interface Props {
  urls:         string[];
  initialIndex: number;
  onClose:      () => void;
}

export function PhotoLightbox({ urls, initialIndex, onClose }: Props) {
  const safeStart = Math.max(0, Math.min(initialIndex, urls.length - 1));
  const [index, setIndex] = useState(safeStart);
  const [mounted, setMounted] = useState(false);

  // SSR-safe portal/window guard — the standard mounted-flag pattern;
  // createPortal needs document.body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  /* Body scroll lock + key handlers + history sentinel.
   *
   * Keydown listener runs in CAPTURE phase so Esc here fires BEFORE
   * BurnReportModal's bubble-phase listener (which would otherwise
   * also call its onClose and dismiss the parent report). Same logic
   * for ←/→: they belong to the lightbox, not anything underneath.
   *
   * History sentinel: when the lightbox opens we push a marker
   * state. Browser back / Android system back triggers popstate,
   * which we map to onClose. Without this, back-from-the-lightbox
   * pops the BurnReportModal's sentinel instead and closes the
   * entire report.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (urls.length > 1) {
        if (e.key === "ArrowRight") {
          e.stopPropagation();
          setIndex((i) => (i + 1) % urls.length);
        } else if (e.key === "ArrowLeft") {
          e.stopPropagation();
          setIndex((i) => (i - 1 + urls.length) % urls.length);
        }
      }
    }
    document.addEventListener("keydown", onKey, true);

    /* Push a sentinel so popstate (back button / swipe-back) maps
       to onClose. Tagged so the popstate handler can tell our entry
       apart from any other history state on the stack. */
    const sentinel = { __photoLightbox: true };
    window.history.pushState(sentinel, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);

    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top      = `-${scrollY}px`;
    body.style.width    = "100%";
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("popstate", onPop);
      body.style.position = "";
      body.style.top      = "";
      body.style.width    = "";
      body.style.overflow = "";
      window.scrollTo(0, scrollY);

      /* Pop our sentinel if it's still on top of the stack. If close
         was triggered BY a popstate event, our entry is already gone
         and history.back() would over-pop into the modal's sentinel. */
      if (window.history.state && (window.history.state as { __photoLightbox?: boolean }).__photoLightbox) {
        window.history.back();
      }
    };
  }, [onClose, urls.length]);

  if (!mounted || typeof document === "undefined") return null;
  if (urls.length === 0) return null;

  const url       = urls[index];
  const showSteps = urls.length > 1;
  const goPrev    = () => setIndex((i) => (i - 1 + urls.length) % urls.length);
  const goNext    = () => setIndex((i) => (i + 1) % urls.length);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     11000,
        background: "rgba(0,0,0,0.94)",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Image wrapper. stopPropagation so a tap on the photo doesn't
          close the lightbox — only the surrounding backdrop does. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "92vw", height: "82vh" }}
      >
        <Image
          src={url}
          alt={`Photo ${index + 1} of ${urls.length}`}
          fill
          sizes="92vw"
          quality={85}
          unoptimized={url.startsWith("blob:")}
          style={{ borderRadius: 12, objectFit: "contain" }}
        />
      </div>

      {/* Close — same coordinates as BurnReportModal's close X
          (top:12 + safe-area, right:12 + safe-area). Aligning the
          two buttons means the modal X is fully behind this one
          with no exposed sliver — earlier 16px offset left a 4px
          edge where taps reached the modal X directly. zIndex
          11001 keeps it above the modal X (10000). */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close photo"
        style={{
          position:                "fixed",
          top:                     "calc(12px + env(safe-area-inset-top))",
          right:                   "calc(12px + env(safe-area-inset-right))",
          width:                   44,
          height:                  44,
          borderRadius:            "50%",
          background:              "rgba(255,255,255,0.14)",
          border:                  "1px solid rgba(255,255,255,0.18)",
          color:                   "#fff",
          cursor:                  "pointer",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          zIndex:                  11001,
          display:                 "flex",
          alignItems:              "center",
          justifyContent:          "center",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Prev / Next + counter — only when there are multiple photos. */}
      {showSteps && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="Previous photo"
            style={navButtonStyle("left")}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13 4L7 10l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="Next photo"
            style={navButtonStyle("right")}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div
            aria-live="polite"
            style={{
              position:    "fixed",
              left:        "50%",
              transform:   "translateX(-50%)",
              bottom:      "calc(20px + env(safe-area-inset-bottom))",
              padding:     "6px 14px",
              borderRadius: 9999,
              background:  "rgba(0,0,0,0.55)",
              border:      "1px solid rgba(255,255,255,0.12)",
              color:       "#fff",
              fontSize:    12,
              letterSpacing: "0.06em",
              zIndex:      11001,
              pointerEvents: "none",
            }}
          >
            {index + 1} / {urls.length}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function navButtonStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position:                "fixed",
    top:                     "50%",
    transform:               "translateY(-50%)",
    [side]:                  "calc(12px + env(safe-area-inset-" + side + "))",
    width:                   44,
    height:                  44,
    borderRadius:            "50%",
    background:              "rgba(255,255,255,0.14)",
    border:                  "1px solid rgba(255,255,255,0.18)",
    color:                   "#fff",
    cursor:                  "pointer",
    touchAction:             "manipulation",
    WebkitTapHighlightColor: "transparent",
    zIndex:                  11001,
    display:                 "flex",
    alignItems:              "center",
    justifyContent:          "center",
  } as React.CSSProperties;
}

/* ------------------------------------------------------------------
   usePhotoLightbox

   Convenience hook for callers that already have the full photo
   list and want to open the viewer at a specific URL. Resolves the
   URL → index lookup so call sites can keep their existing
   `(url) => …` callback shape.

   Usage:
     const lightbox = usePhotoLightbox(photoUrls);
     <SomePhotoStrip onPhotoClick={lightbox.open} />
     {lightbox.node}
   ------------------------------------------------------------------ */

export function usePhotoLightbox(urls: string[]) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function openByUrl(url: string) {
    const idx = urls.indexOf(url);
    setOpenIndex(idx >= 0 ? idx : 0);
  }

  const node = openIndex !== null
    ? <PhotoLightbox urls={urls} initialIndex={openIndex} onClose={() => setOpenIndex(null)} />
    : null;

  return { open: openByUrl, node };
}
