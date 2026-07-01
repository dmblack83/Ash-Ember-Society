"use client";

/*
 * BottomSheet — the app's one sheet primitive.
 *
 * Bottom sheet on mobile (drag-to-dismiss, spring physics), centered
 * modal on sm+ (no drag). Replaces the hand-rolled backdrop + dialog +
 * scroll-lock scaffolding that was copy-pasted per sheet.
 *
 * Physics: the drag loop mutates transform/opacity directly on the
 * DOM nodes (no React re-render per frame); React-owned styles are
 * re-applied on release. Snap-back and dismissal both use the shared
 * spring tokens (--ease-spring / --dur-sheet) so every sheet in the
 * app moves identically. prefers-reduced-motion collapses all motion
 * to instant transitions.
 *
 * Mount pattern: always-mounted with an `open` prop (matches the
 * existing sheets so call sites keep their lazy-load semantics).
 */

import React, { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";

const DESKTOP_QUERY = "(min-width: 640px)";

/* Dismiss when dragged past this fraction of the sheet height... */
const DISMISS_FRACTION = 0.35;
/* ...or flicked faster than this (px/ms) with meaningful travel. */
const DISMISS_VELOCITY = 0.55;
const DISMISS_MIN_TRAVEL = 24;

export interface BottomSheetProps {
  open:      boolean;
  onClose:   () => void;
  ariaLabel: string;
  /** Scrollable body. */
  children:  React.ReactNode;
  /** Fixed (non-scrolling) header above the body. */
  header?:   React.ReactNode;
  /** Fixed (non-scrolling) footer below the body. */
  footer?:   React.ReactNode;
  /** Mobile sheet height. */
  mobileHeight?:    string;
  /** Desktop modal max-width in px. */
  desktopMaxWidth?: number;
  /** Desktop modal height; "auto" sizes to content (max 90dvh). */
  desktopHeight?:   string;
  surface?:    "card" | "background";
  showHandle?: boolean;
  /** Optional external access to the scroll container. */
  scrollRef?:  React.RefObject<HTMLDivElement | null>;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  children,
  header,
  footer,
  mobileHeight    = "92dvh",
  desktopMaxWidth = 448,
  desktopHeight   = "auto",
  surface         = "card",
  showHandle      = true,
  scrollRef,
}: BottomSheetProps) {
  useEscapeKey(open, onClose);
  useBodyScrollLock(open);

  /* Desktop = centered modal, no drag. SSR + first client render
     assume mobile (the app is mobile-first); the media query resolves
     before any sheet is opened in practice. */
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef    = useRef<HTMLDivElement>(null);
  const innerScrollRef = useRef<HTMLDivElement>(null);

  /* Reset scroll position each time the sheet opens. */
  useEffect(() => {
    if (open && innerScrollRef.current) innerScrollRef.current.scrollTop = 0;
  }, [open]);

  /* Expose the scroller to callers that need it. */
  useEffect(() => {
    if (scrollRef) scrollRef.current = innerScrollRef.current;
  });

  /* ── Drag-to-dismiss (mobile only) ─────────────────────────────
     Native listeners (touchmove must be non-passive to preventDefault
     the rubber-band once a drag is armed). All per-frame updates
     mutate the DOM directly. */
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !open) return;

    let startY   = 0;
    let dy       = 0;
    let armed    = false;
    let dragging = false;
    let lastY    = 0;
    let lastT    = 0;
    let velocity = 0;

    const clearInline = () => {
      /* Hand style ownership back to React's declarative values. */
      sheet.style.transform = "";
      sheet.style.transition = "";
      if (backdropRef.current) {
        backdropRef.current.style.opacity = "";
        backdropRef.current.style.transition = "";
      }
    };

    const onStart = (e: TouchEvent) => {
      if (window.matchMedia(DESKTOP_QUERY).matches) return;
      const scroller = innerScrollRef.current;
      /* Only arm when the body is scrolled to the top — otherwise the
         gesture is a content scroll, not a dismiss. */
      armed    = !scroller || scroller.scrollTop <= 0;
      startY   = e.touches[0].clientY;
      lastY    = startY;
      lastT    = e.timeStamp;
      dy       = 0;
      dragging = false;
      velocity = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const y = e.touches[0].clientY;
      dy = y - startY;

      if (dy <= 0) {
        /* Upward — not a dismiss. If we had started dragging, snap home. */
        if (dragging) {
          dragging = false;
          clearInline();
        }
        return;
      }

      dragging = true;
      e.preventDefault();

      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;

      sheet.style.transition = "none";
      sheet.style.transform  = `translateY(${dy}px)`;
      if (backdropRef.current) {
        const h = sheet.offsetHeight || 1;
        backdropRef.current.style.transition = "none";
        backdropRef.current.style.opacity =
          String(Math.max(0, 1 - (dy / h) * 0.9));
      }
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;

      const h = sheet.offsetHeight || 1;
      const shouldDismiss =
        dy > h * DISMISS_FRACTION ||
        (velocity > DISMISS_VELOCITY && dy > DISMISS_MIN_TRAVEL);

      if (shouldDismiss) {
        /* Finish the exit from the current position with the spring,
           then let the parent unmount/close. React's `open=false`
           styles take over seamlessly (same end state). */
        const dur = reducedMotion() ? 0 : 340;
        sheet.style.transition = `transform ${dur}ms var(--ease-spring)`;
        sheet.style.transform  = "translateY(100%)";
        if (backdropRef.current) {
          backdropRef.current.style.transition = `opacity ${dur}ms ease`;
          backdropRef.current.style.opacity = "0";
        }
        window.setTimeout(() => {
          onClose();
          clearInline();
        }, dur);
      } else {
        /* Snap back home with the spring. */
        const dur = reducedMotion() ? 0 : 340;
        sheet.style.transition = `transform ${dur}ms var(--ease-spring)`;
        sheet.style.transform  = "translateY(0)";
        if (backdropRef.current) {
          backdropRef.current.style.transition = `opacity ${dur}ms ease`;
          backdropRef.current.style.opacity = "1";
        }
        window.setTimeout(clearInline, dur);
      }
    };

    sheet.addEventListener("touchstart",  onStart, { passive: true });
    sheet.addEventListener("touchmove",   onMove,  { passive: false });
    sheet.addEventListener("touchend",    onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart",  onStart);
      sheet.removeEventListener("touchmove",   onMove);
      sheet.removeEventListener("touchend",    onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [open, onClose]);

  const motionMs = reducedMotion() ? "0ms" : "var(--dur-sheet)";
  const surfaceColor = surface === "card" ? "var(--card)" : "var(--background)";

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "rgba(0,0,0,0.65)",
          backdropFilter:  "blur(4px)",
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? "auto" : "none",
          touchAction:     "none",
          transition:      `opacity ${motionMs} ease`,
        }}
        onClick={onClose}
      />

      {/* Sheet (mobile) / modal (sm+) */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={[
          "fixed z-50 shadow-2xl flex flex-col overflow-hidden",
          isDesktop
            ? "inset-0 m-auto rounded-2xl w-full"
            : "inset-x-0 bottom-0 rounded-t-2xl",
        ].join(" ")}
        style={{
          backgroundColor: surfaceColor,
          border:          isDesktop ? "1px solid var(--border)" : undefined,
          height:          isDesktop
            ? (desktopHeight === "auto" ? "fit-content" : desktopHeight)
            : mobileHeight,
          maxHeight:       isDesktop ? "90dvh" : undefined,
          maxWidth:        isDesktop ? desktopMaxWidth : undefined,
          transform:       isDesktop
            ? (open ? "translateY(0)" : "translateY(12px)")
            : (open ? "translateY(0)" : "translateY(100%)"),
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? "auto" : "none",
          transition:      [
            `transform ${motionMs} var(--ease-spring)`,
            `opacity ${motionMs} ease`,
            open ? "" : `visibility 0ms ${motionMs}`,
          ].filter(Boolean).join(", "),
          visibility:      open ? "visible" : "hidden",
        }}
      >
        {/* Drag handle — mobile only */}
        {showHandle && !isDesktop && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted" />
          </div>
        )}

        {header && <div className="flex-shrink-0">{header}</div>}

        {/* Scrollable body */}
        <div
          ref={innerScrollRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
          style={{
            overscrollBehavior:      "contain",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
        >
          {children}
        </div>

        {footer && <div className="flex-shrink-0">{footer}</div>}
      </div>
    </>
  );
}
