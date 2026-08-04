"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter }    from "next/navigation";
import { CigarImage }   from "@/components/ui/CigarImage";
import { drawPool, isDrawEligible, pickDraw } from "@/lib/home/blind-draw";
import type { HumidorItem } from "@/components/humidor/HumidorClient";

/* ------------------------------------------------------------------
   The Blind Draw — home page card + draw modal.

   The card is a fixed-height teaser: eyebrow, one-line hook, Draw
   button. Tapping Draw opens a CENTERED MODAL (Dave's call: overlay
   so the page never shifts; centered rather than a bottom sheet).
   Modal chrome follows UpgradeLimitModal: fixed backdrop, escape +
   backdrop-tap dismiss, body scroll lock. Inside: slot-reel of the
   user's own cigars decelerating onto the pick (mockup direction A),
   then the reveal with image / brand / series / vitola.

   Renders null with fewer than 2 unique in-stock cigars.
   ------------------------------------------------------------------ */

const ROW_H     = 64;   // reel row height, matches mockup
const LOOPS     = 3;    // full passes of the pool before landing
const REEL_MS   = 2800; // transform duration
const REVEAL_MS = 3100; // reel duration + settle beat

type Phase = "reel" | "result";

export function BlindDraw({ items }: { items: HumidorItem[] }) {
  const router = useRouter();
  const pool   = drawPool(items);

  const [modalOpen, setModalOpen] = useState(false);
  const [phase,     setPhase]     = useState<Phase>("reel");
  const [drawn,     setDrawn]     = useState<HumidorItem | null>(null);
  const [mounted,   setMounted]   = useState(false);
  const reelRef  = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSR-safe portal gate: setMounted in an effect is the standard
  // client-only render pattern (same as PhotoLightbox); lint rule
  // doesn't model it, disabled per-line.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const closeModal = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setModalOpen(false);
    setDrawn(null);
    setPhase("reel");
  };

  /* Escape dismiss + body scroll lock while the modal is open — same
     lifecycle as UpgradeLimitModal. */
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      window.scrollTo(0, scrollY);
    };
  }, [modalOpen]);

  if (!isDrawEligible(pool)) return null;

  function reducedMotion(): boolean {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function runDraw(excludeId?: string) {
    const winner = pickDraw(pool, excludeId);
    if (!winner) return;
    setDrawn(winner);

    if (reducedMotion()) {
      setPhase("result");
      setModalOpen(true);
      return;
    }

    setPhase("reel");
    setModalOpen(true);

    /* Kick the reel on the next frame so the sheet + reel are mounted
       at translateY(0) before the transition target is set. Double rAF:
       the first fires before paint of the initial position. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const reel = reelRef.current;
      if (!reel) { setPhase("result"); return; }
      const wIdx = LOOPS * pool.length + pool.findIndex((p) => p.id === winner.id);
      reel.style.transition = "none";
      reel.style.transform  = "translateY(0)";
      void reel.offsetWidth;
      reel.style.transition = `transform ${REEL_MS}ms cubic-bezier(.12,.65,.15,1)`;
      reel.style.transform  = `translateY(${-wIdx * ROW_H}px)`;
    }));
    timerRef.current = setTimeout(() => setPhase("result"), REVEAL_MS);
  }

  /* Reel sequence: LOOPS passes of the pool, then one more pass whose
     winner row is the landing point, plus two trailing rows so the
     window never shows blank space at the end of travel. */
  const reelRows = drawn
    ? [
        ...Array.from({ length: LOOPS }, () => pool).flat(),
        ...pool,
        pool[0],
        pool[Math.min(1, pool.length - 1)],
      ]
    : [];

  const eyebrowStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.28em",
    textTransform: "uppercase", color: "var(--muted-foreground)",
    display: "flex", alignItems: "center", gap: 10,
  };

  return (
    <>
      {/* ── Teaser card (fixed height, never changes) ─────────────── */}
      <section
        aria-label="The Blind Draw"
        style={{
          border:       "1px solid var(--card-border, var(--border))",
          borderRadius: 6,
          background:   "var(--card-bg, var(--card))",
          padding:      "14px 14px 16px",
          position:     "relative",
          overflow:     "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at top right, rgba(232,100,44,0.12), transparent 65%)",
          }}
        />
        <div style={{ ...eyebrowStyle, marginBottom: 10 }}>
          The Blind Draw
          <span aria-hidden style={{ flex: 1, height: 1, background: "var(--line, var(--border))" }} />
        </div>
        <p
          style={{
            fontFamily: "var(--font-serif)", fontWeight: 600, lineHeight: 1.15,
            whiteSpace: "nowrap",
            /* One row always: scales with viewport, floors at tiny phones. */
            fontSize: "clamp(13.5px, 4.4vw, 17.5px)",
            marginBottom: 12,
          }}
        >
          Can&rsquo;t decide? <em style={{ color: "var(--gold, #D4A04A)" }}>Let fate choose your next burn.</em>
        </p>
        <button
          type="button"
          onClick={() => runDraw()}
          className="w-full rounded-xl font-semibold text-sm"
          style={{
            height: 48,
            background: "linear-gradient(135deg, #D4A04A, #C17817)",
            color: "#1A1210", border: "none", cursor: "pointer",
            touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            position: "relative",
          }}
        >
          Draw
        </button>
      </section>

      {/* ── Draw modal (centered) ─────────────────────────────────── */}
      {mounted && modalOpen && drawn && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="The Blind Draw"
          onClick={closeModal}
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.72)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-2xl"
            style={{
              maxWidth:   400,
              background: "var(--card)",
              border:     "1px solid var(--border)",
              boxShadow:  "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center justify-between px-5" style={{ paddingTop: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <div style={eyebrowStyle}>The Blind Draw</div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 32, height: 32, flexShrink: 0,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)", cursor: "pointer",
                  touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-6">
            {phase === "reel" ? (
              <div
                aria-label="Drawing a cigar"
                style={{
                  height: ROW_H, overflow: "hidden", borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--secondary, #3D2E23)",
                  position: "relative",
                }}
              >
                {/* edge fades */}
                <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 14, zIndex: 2, background: "linear-gradient(180deg, var(--secondary, #3D2E23), transparent)" }} />
                <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, zIndex: 2, background: "linear-gradient(0deg, var(--secondary, #3D2E23), transparent)" }} />
                <div aria-hidden style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: 10, zIndex: 3, color: "var(--ember, #E8642C)", fontSize: 13 }}>
                  &#9664;
                </div>
                <div ref={reelRef} style={{ willChange: "transform" }}>
                  {reelRows.map((it, i) => (
                    <div key={`${it.id}-${i}`} className="flex items-center gap-3 px-3" style={{ height: ROW_H }}>
                      <div className="rounded-lg overflow-hidden flex-shrink-0" style={{ width: 44, height: 44 }}>
                        <CigarImage
                          imageUrl={it.cigar.image_url}
                          wrapper={it.cigar.wrapper}
                          alt=""
                          width={44}
                          height={44}
                          sizes="44px"
                          quality={70}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                          {it.cigar.brand}
                        </p>
                        <p className="truncate" style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>
                          {it.cigar.series ?? it.cigar.format}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="text-center"
                style={{ animation: "ae-blind-draw-pop .45s cubic-bezier(.2,1.4,.4,1)" }}
              >
                <style>{`
                  @keyframes ae-blind-draw-pop {
                    0% { transform: scale(.7); opacity: 0; }
                    60% { transform: scale(1.06); opacity: 1; }
                    100% { transform: scale(1); }
                  }
                  @keyframes ae-blind-draw-ember {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(232,100,44,0); }
                    50% { box-shadow: 0 0 24px 2px rgba(232,100,44,.35); }
                  }
                `}</style>
                <div
                  className="rounded-2xl overflow-hidden mx-auto"
                  style={{ width: 88, height: 88, marginBottom: 12, animation: "ae-blind-draw-ember 1.6s ease-in-out infinite" }}
                >
                  <CigarImage
                    imageUrl={drawn.cigar.image_url}
                    wrapper={drawn.cigar.wrapper}
                    alt={`${drawn.cigar.brand} ${drawn.cigar.series ?? ""}`}
                    width={176}
                    height={176}
                    sizes="88px"
                    quality={80}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.26em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                  {drawn.cigar.brand}
                </p>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: "var(--foreground)", margin: "2px 0" }}>
                  {drawn.cigar.series ?? drawn.cigar.format}
                </p>
                {drawn.cigar.format && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)", marginBottom: 16 }}>
                    {drawn.cigar.format}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setModalOpen(false); router.push(`/humidor/${drawn.id}/burn-report`); }}
                    className="w-full rounded-xl font-semibold text-sm"
                    style={{
                      height: 48,
                      background: "linear-gradient(135deg, #D4A04A, #C17817)",
                      color: "#1A1210", border: "none", cursor: "pointer",
                      touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    &#128293;&nbsp; Light It Up
                  </button>
                  <button
                    type="button"
                    onClick={() => runDraw(drawn.id)}
                    className="w-full rounded-xl text-xs font-semibold"
                    style={{
                      height: 40, background: "transparent",
                      color: "var(--muted-foreground)",
                      border: "1px solid var(--border)", cursor: "pointer",
                      touchAction: "manipulation",
                    }}
                  >
                    Draw again
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
