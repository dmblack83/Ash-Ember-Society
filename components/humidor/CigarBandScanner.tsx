"use client";

import { cigarDisplayName, sizeLabel } from "@/lib/cigars/line-group";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal }           from "react-dom";
import { createClient }           from "@/utils/supabase/client";
import { CigarImage }             from "@/components/ui/CigarImage";
import dynamic                    from "next/dynamic";
import type { CatalogResult }     from "@/lib/data/cigar-fetchers";
import { computeCoverCrop }       from "@/lib/scanner/crop";
import { selectQueryWords, scoreCandidates } from "@/lib/scanner/ocr-match";
import { groupMatchesByLine, type LineMatchGroup } from "@/lib/scanner/group-matches";
import type { AddFlowEntry } from "@/lib/cigars/add-flow-entry";

/* AddFlowSheet is lazy-loaded — same rationale as HumidorClient/
   WishlistClient: it's only needed once a match is tapped. */
const AddFlowSheet = dynamic(
  () => import("@/components/cigars/add-flow/AddFlowSheet").then((m) => ({ default: m.AddFlowSheet })),
  { ssr: false },
);

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type Phase =
  | "requesting"   // asking for camera permission
  | "camera"       // live viewfinder
  | "processing"   // Vision API + catalog search in flight
  | "results"      // matches found
  | "no_match"     // nothing found
  | "denied";      // camera permission refused

interface Props {
  onClose:  () => void;
  onAdded:  () => void;   // refresh humidor list
  defaultHumidorId?: string | null;  // preselect in the unified add sheet
}

/* ------------------------------------------------------------------
   Viewfinder frame geometry — the capture crop is derived from these,
   so the gold frame on screen is exactly what gets OCR'd (plus padding).
   ------------------------------------------------------------------ */

const FRAME_VW_FRAC      = 0.8;   // frame edge = min(80vw, 300px)
const FRAME_MAX_PX       = 300;
const FRAME_OFFSET_Y_FRAC = -0.1; // frame center sits 10% of its height above screen center
const CROP_PAD           = 1.2;   // 20% slop around the frame for loose framing
const OUTPUT_MAX_PX      = 1024;

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
};

/* ------------------------------------------------------------------
   Catalog matching — runs client-side for speed
   ------------------------------------------------------------------ */

async function matchCatalog(ocrText: string): Promise<CatalogResult[]> {
  const words = selectQueryWords(ocrText);
  if (words.length === 0) return [];

  const orFilter = words
    .flatMap((w) => [
      `brand.ilike.%${w}%`,
      `series.ilike.%${w}%`,
      `format.ilike.%${w}%`,
    ])
    .join(",");

  const supabase = createClient();
  const { data } = await supabase
    .from("cigar_catalog")
    .select(
      "id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url"
    )
    .or(orFilter)
    .order("usage_count", { ascending: false })
    .limit(200);

  if (!data?.length) return [];

  return scoreCandidates(words, ocrText, data as CatalogResult[]);
}

/* ------------------------------------------------------------------
   Image capture — crop to the viewfinder frame at native camera
   resolution (≤ 1024 px output) instead of downscaling the full frame
   ------------------------------------------------------------------ */

function captureImage(video: HTMLVideoElement): string {
  const frameSize = Math.min(window.innerWidth * FRAME_VW_FRAC, FRAME_MAX_PX);
  const { sx, sy, size } = computeCoverCrop({
    videoWidth:  video.videoWidth,
    videoHeight: video.videoHeight,
    screenWidth:  window.innerWidth,
    screenHeight: window.innerHeight,
    frameSize,
    frameOffsetYFrac: FRAME_OFFSET_Y_FRAC,
    pad: CROP_PAD,
  });

  const out = Math.round(Math.min(size, OUTPUT_MAX_PX));
  const canvas = document.createElement("canvas");
  canvas.width  = out;
  canvas.height = out;
  canvas.getContext("2d")!.drawImage(video, sx, sy, size, size, 0, 0, out, out);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/* ------------------------------------------------------------------
   CigarBandScanner
   ------------------------------------------------------------------ */

export function CigarBandScanner({ onClose, onAdded, defaultHumidorId }: Props) {
  const [phase,         setPhase]         = useState<Phase>("requesting");
  const [statusText,    setStatusText]    = useState("Initializing camera…");
  const [matches,       setMatches]       = useState<CatalogResult[]>([]);
  const [ocrWords,      setOcrWords]      = useState<string[]>([]);
  const [sheetEntry,    setSheetEntry]    = useState<AddFlowEntry | null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* Line-grouped results (mockup 08): a band identifies the LINE, not
     the size, so matches are grouped back to (brand, series) before
     display. `matches` arrives pre-ranked by scoreCandidates, so the
     first group encountered is always the best-scoring line. */
  const groups = useMemo(() => groupMatchesByLine(matches), [matches]);
  const primaryGroup = groups[0] ?? null;
  const restGroups    = groups.slice(1);

  /* Best guess at a search/manual seed when nothing (or nothing good
     enough) matched: the top group's brand, else the single most
     distinctive OCR word. */
  const bestBrandGuess = primaryGroup?.brand ?? ocrWords[0];

  function handlePickGroup(group: LineMatchGroup) {
    if (group.children.length === 1) {
      setSheetEntry({ kind: "vitola", cigarId: group.children[0].id });
      return;
    }
    setSheetEntry({ kind: "line", brand: group.brand, series: group.series, fromScan: true });
  }

  /* ── Camera lifecycle ───────────────────────────────────────────── */

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPhase("camera");
      } catch {
        setPhase("denied");
      }
    }

    start();
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera]);

  /* Lock body scroll */
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  /* ── Capture → OCR → Match ──────────────────────────────────────── */

  async function handleCapture() {
    const video = videoRef.current;
    if (!video || phase !== "camera") return;

    const base64 = captureImage(video);
    stopCamera();
    setPhase("processing");
    setStatusText("Reading band…");

    try {
      const res = await fetch("/api/vision/analyze", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image: base64, type: "cigar_band" }),
      });

      if (!res.ok) throw new Error("API error");

      const { ocrText } = await res.json();

      if (!ocrText?.trim()) {
        setOcrWords([]);
        setPhase("no_match");
        return;
      }

      /* Computed alongside matchCatalog's own (identical) tokenizing —
         kept here too so bestBrandGuess has a fallback even when no
         catalog row matches at all. matchCatalog itself is untouched. */
      setOcrWords(selectQueryWords(ocrText));

      setStatusText("Searching catalog…");
      const found = await matchCatalog(ocrText);

      if (!found.length) {
        setPhase("no_match");
        return;
      }

      setMatches(found);
      setPhase("results");
    } catch {
      setPhase("no_match");
    }
  }

  /* ── Retry ──────────────────────────────────────────────────────── */

  async function handleRetry() {
    setPhase("requesting");
    setMatches([]);
    setOcrWords([]);
    setSheetEntry(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("camera");
    } catch {
      setPhase("denied");
    }
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  const content = (
    <div
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          9999,
        backgroundColor: "#000",
        display:         "flex",
        flexDirection:   "column",
      }}
    >
      {/* ── Live camera feed ──────────────────────────────────────── */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position:   "absolute",
          inset:      0,
          width:      "100%",
          height:     "100%",
          objectFit:  "cover",
          opacity:    phase === "camera" ? 1 : 0.25,
          transition: "opacity 0.3s",
        }}
      />

      {/* ── Camera viewfinder UI ──────────────────────────────────── */}
      {(phase === "camera" || phase === "requesting") && (
        <>
          {/* Dark overlay with frame cutout via box-shadow */}
          <div
            style={{
              position:  "absolute",
              top:       "50%",
              left:      "50%",
              transform: `translate(-50%, -50%) translateY(${FRAME_OFFSET_Y_FRAC * 100}%)`,
              width:     `min(${FRAME_VW_FRAC * 100}vw, ${FRAME_MAX_PX}px)`,
              height:    `min(${FRAME_VW_FRAC * 100}vw, ${FRAME_MAX_PX}px)`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
              borderRadius: 8,
              zIndex:    1,
            }}
          >
            {/* Gold corner brackets */}
            {[
              { top:    -2, left:  -2, borderTop:    "3px solid var(--gold)", borderLeft:   "3px solid var(--gold)", borderRadius: "4px 0 0 0" },
              { top:    -2, right: -2, borderTop:    "3px solid var(--gold)", borderRight:  "3px solid var(--gold)", borderRadius: "0 4px 0 0" },
              { bottom: -2, left:  -2, borderBottom: "3px solid var(--gold)", borderLeft:   "3px solid var(--gold)", borderRadius: "0 0 0 4px" },
              { bottom: -2, right: -2, borderBottom: "3px solid var(--gold)", borderRight:  "3px solid var(--gold)", borderRadius: "0 0 4px 0" },
            ].map((s, i) => (
              <div key={i} style={{ position: "absolute", width: 22, height: 22, ...s }} />
            ))}
          </div>

          {/* Instruction text */}
          <div
            style={{
              position:  "absolute",
              top:       "50%",
              left:      "50%",
              transform: "translate(-50%, calc(-50% + min(40vw, 150px) + 16px + -10%))",
              zIndex:    2,
              textAlign: "center",
            }}
          >
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, letterSpacing: "0.02em" }}>
              Align the cigar band within the frame
            </p>
          </div>
        </>
      )}

      {/* ── Processing overlay ────────────────────────────────────── */}
      {phase === "processing" && (
        <div
          style={{
            position:        "absolute",
            inset:           0,
            zIndex:          2,
            display:         "flex",
            flexDirection:   "column",
            alignItems:      "center",
            justifyContent:  "center",
            gap:             16,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        >
          <span
            className="inline-block rounded-full border-2 border-t-transparent animate-spin"
            style={{ width: 40, height: 40, borderColor: "var(--gold)", borderTopColor: "transparent" }}
          />
          <p style={{ color: "#fff", fontSize: 15, fontWeight: 500 }}>{statusText}</p>
        </div>
      )}

      {/* ── Denied ───────────────────────────────────────────────── */}
      {phase === "denied" && (
        <div
          style={{
            position:       "absolute",
            inset:          0,
            zIndex:         2,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            padding:        32,
            gap:            16,
            textAlign:      "center",
          }}
        >
          <p style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Camera Access Required</p>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.5 }}>
            Allow camera access in your device settings, then try again.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ marginTop: 8 }}
          >
            Go Back
          </button>
        </div>
      )}

      {/* ── Results panel (slides up) ─────────────────────────────── */}
      {(phase === "results" || phase === "no_match") && (
        <div
          style={{
            position:        "absolute",
            bottom:          0,
            left:            0,
            right:           0,
            zIndex:          3,
            backgroundColor: "var(--card)",
            borderRadius:    "20px 20px 0 0",
            paddingBottom:   "env(safe-area-inset-bottom)",
            maxHeight:       "72dvh",
            overflowY:       "auto",
            overscrollBehavior: "contain",
          }}
        >
          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
          </div>

          <div className="px-4 pb-4">
            {phase === "no_match" ? (
              <div className="py-6 text-center space-y-4">
                <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
                  No cigar found from this image.
                </p>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={() => setSheetEntry({ kind: "search", query: bestBrandGuess })}
                >
                  Search the Catalog
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={() => setSheetEntry({ kind: "manual", brand: bestBrandGuess })}
                >
                  Add Manually
                </button>
                <button
                  type="button"
                  className="btn btn-ghost w-full text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                  onClick={handleRetry}
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                <p
                  className="text-xs uppercase font-semibold tracking-widest pb-3 pt-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Match Found
                </p>

                <div className="space-y-2">
                  {primaryGroup && (
                    <LineMatchCard group={primaryGroup} onPick={() => handlePickGroup(primaryGroup)} />
                  )}

                  {restGroups.map((group) => (
                    <LineMatchCard
                      key={group.children[0].id}
                      group={group}
                      muted
                      onPick={() => handlePickGroup(group)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="w-full text-xs text-center mt-3"
                  style={{ color: "var(--muted-foreground)" }}
                  onClick={() => setSheetEntry({ kind: "search", query: bestBrandGuess })}
                >
                  None of these? Search instead
                </button>

                <button
                  type="button"
                  className="w-full btn btn-ghost text-sm mt-3"
                  style={{ color: "var(--muted-foreground)" }}
                  onClick={handleRetry}
                >
                  Scan Again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Top bar: Close + title ────────────────────────────────── */}
      <div
        style={{
          position:  "absolute",
          top:       0,
          left:      0,
          right:     0,
          zIndex:    10,
          display:   "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding:   "env(safe-area-inset-top) 16px 12px",
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
        }}
      >
        <button
          type="button"
          onClick={() => { stopCamera(); onClose(); }}
          className="flex items-center justify-center rounded-full"
          style={{
            width:      40,
            height:     40,
            backgroundColor: "rgba(0,0,0,0.45)",
            border:     "none",
            color:      "#fff",
            cursor:     "pointer",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-label="Close scanner"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 600 }}>
          Scan Cigar Band
        </p>

        <div style={{ width: 40 }} />
      </div>

      {/* ── Capture button ────────────────────────────────────────── */}
      {phase === "camera" && (
        <div
          style={{
            position:  "absolute",
            bottom:    "calc(env(safe-area-inset-bottom) + 40px)",
            left:      "50%",
            transform: "translateX(-50%)",
            zIndex:    5,
          }}
        >
          <button
            type="button"
            onClick={handleCapture}
            aria-label="Capture"
            style={{
              width:           72,
              height:          72,
              borderRadius:    "50%",
              border:          "4px solid rgba(255,255,255,0.85)",
              backgroundColor: "rgba(255,255,255,0.18)",
              cursor:          "pointer",
              touchAction:     "manipulation",
              WebkitTapHighlightColor: "transparent",
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: "50%", backgroundColor: "#fff" }} />
          </button>
        </div>
      )}

      {/* Unified add sheet for the tapped group/link/button */}
      <AddFlowSheet
        open={sheetEntry !== null}
        entry={sheetEntry ?? { kind: "search" }}
        mode="humidor"
        defaultHumidorId={defaultHumidorId}
        onClose={() => setSheetEntry(null)}
        onAdded={() => {
          setSheetEntry(null);
          stopCamera();
          onAdded();
          onClose();
        }}
      />
    </div>
  );

  return createPortal(content, document.body);
}

/* ------------------------------------------------------------------
   LineMatchCard — one grouped line, mockup 08. `muted` renders the
   smaller, lower-emphasis row used for every group after the first.
   ------------------------------------------------------------------ */

function LineMatchCard({
  group, muted, onPick,
}: {
  group: LineMatchGroup;
  muted?: boolean;
  onPick: () => void;
}) {
  const top   = group.children[0];
  const count = group.children.length;
  const size  = muted ? 40 : 52;

  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full flex items-center gap-3 rounded-xl text-left"
      style={{
        padding:         muted ? "8px 12px" : "12px",
        backgroundColor: muted ? "transparent" : "var(--secondary)",
        border:          "1px solid var(--border)",
        opacity:         muted ? 0.75 : 1,
        cursor:          "pointer",
        touchAction:     "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Cigar image */}
      <div
        className="rounded-lg overflow-hidden flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <CigarImage
          imageUrl={top.image_url}
          wrapper={top.wrapper}
          alt={group.series ? `${group.brand ?? ""} ${group.series}`.trim() : cigarDisplayName(top)}
          width={size}
          height={size}
          sizes={`${size}px`}
          quality={75}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* Brand + series */}
      <div className="flex-1 min-w-0">
        {group.brand && (
          <p
            className={muted ? "text-[9px] uppercase tracking-widest font-semibold" : "text-[10px] uppercase tracking-widest font-medium"}
            style={{ color: muted ? "var(--muted-foreground)" : "var(--primary)" }}
          >
            {group.brand}
          </p>
        )}
        {group.series && (
          <p
            className={muted ? "text-xs font-medium truncate" : "text-sm font-semibold truncate"}
            style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}
          >
            {group.series}
          </p>
        )}
        {count === 1 && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {sizeLabel(top)}
          </p>
        )}
      </div>

      {/* Vitola count chip, or the Add indicator on the primary card */}
      {count > 1 ? (
        <span
          className="flex-shrink-0 whitespace-nowrap text-[10px] font-semibold px-2.5 py-1 rounded-full border"
          style={muted
            ? { color: "var(--muted-foreground)", borderColor: "var(--border)" }
            : { backgroundColor: "rgba(212,160,74,0.12)", color: "var(--gold)", borderColor: "var(--gold-deep)" }}
        >
          {count} vitolas
        </span>
      ) : !muted && (
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, backgroundColor: "rgba(212,160,74,0.15)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </button>
  );
}
