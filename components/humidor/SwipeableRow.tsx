"use client";
import { useEffect, useRef, useState } from "react";

const ACTIONS_WIDTH = 164;   // two 82px actions
const FULL_SWIPE = 260;      // past this, release triggers quick log
const INTENT = 10;           // px before we claim the gesture

interface SwipeableRowProps {
  children:     React.ReactNode;
  onQuickLog:   () => void;
  onBurnReport: () => void;
}

/* Horizontal swipe reveal for humidor list rows. Claims the gesture
   only after horizontal intent beats vertical (|dx| > |dy| and
   |dx| > INTENT) so vertical scroll and pull-to-refresh keep working.
   Transform-only animation. */
export function SwipeableRow({ children, onQuickLog, onBurnReport }: SwipeableRowProps) {
  const [offset, setOffset]   = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const claimed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: offset };
    claimed.current = false;
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (!claimed.current) {
      if (Math.abs(dx) <= INTENT || Math.abs(dx) <= Math.abs(dy)) return;
      claimed.current = true;
    }
    setOffset(Math.min(0, Math.max(-FULL_SWIPE - 40, start.current.base + dx)));
  }
  function onTouchEnd() {
    setDragging(false);
    start.current = null;
    if (!claimed.current) return;
    if (offset <= -FULL_SWIPE) { setOffset(0); onQuickLog(); return; }
    setOffset(offset <= -ACTIONS_WIDTH / 2 ? -ACTIONS_WIDTH : 0);
  }
  /* iOS fires touchcancel (incoming call, OS edge gestures) with no
     touchend — without this, dragging stays true (transition stuck off)
     and the row freezes mid-drag. Always snap closed, never trigger an
     action, on cancel. */
  function onTouchCancel() {
    setDragging(false);
    start.current = null;
    claimed.current = false;
    setOffset(0);
  }
  const close = () => setOffset(0);

  /* Tap on an open row closes it instead of navigating. The row content
     is an IntentLink; a tap with no drag never claims the gesture, so
     without this capture-phase guard the click would fire and navigate
     while the actions are revealed. */
  function onContentClickCapture(e: React.MouseEvent) {
    if (offset === 0) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  /* While open (and not mid-drag), close on outside interaction:
     - window scroll (capture:true so inner scroll containers trigger it)
     - a touch starting outside this row's root element.
     The touchstart path also gives one-open-at-a-time for free: opening
     row B begins with a touchstart outside row A, closing A. */
  useEffect(() => {
    if (offset === 0 || dragging) return;
    const onScroll = () => setOffset(0);
    const onDocTouchStart = (e: TouchEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setOffset(0);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("touchstart", onDocTouchStart, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("touchstart", onDocTouchStart);
    };
  }, [offset, dragging]);

  return (
    <div ref={rootRef} className="relative rounded-xl overflow-hidden"
         onTouchStart={onTouchStart} onTouchMove={onTouchMove}
         onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={offset === 0}>
        <button type="button" tabIndex={offset === 0 ? -1 : 0}
          onClick={() => { close(); onBurnReport(); }}
          className="w-[82px] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "linear-gradient(180deg, var(--accent), #a87c32)", color: "#1a1208" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="4" y="2" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6.5 6h5M6.5 9h5M6.5 12h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Burn<br/>Report
        </button>
        <button type="button" tabIndex={offset === 0 ? -1 : 0}
          onClick={() => { close(); onQuickLog(); }}
          className="w-[82px] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "linear-gradient(180deg, #f07a42, var(--ember, #E8642C))", color: "#1a0d06" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="2" y="7.5" width="11" height="3.5" rx="1.75" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 7.5v3.5M8.5 7.5v3.5" stroke="currentColor" strokeWidth="1" />
            <circle cx="15" cy="9.25" r="1.75" fill="currentColor" />
          </svg>
          Quick<br/>Log
        </button>
      </div>
      <div onClickCapture={onContentClickCapture}
           style={{ transform: `translateX(${offset}px)`,
                    transition: dragging ? "none" : "transform 200ms ease" }}>
        {children}
      </div>
    </div>
  );
}
