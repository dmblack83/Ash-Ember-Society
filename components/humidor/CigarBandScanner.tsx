"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal }           from "react-dom";
import { createClient }           from "@/utils/supabase/client";
import { CigarImage }             from "@/components/ui/CigarImage";
import { AddToHumidorSheet }      from "@/components/cigars/AddToHumidorSheet";
import type { CatalogResult }     from "@/components/cigar-search";

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
  onSearch: () => void;   // fallback to text search
}

/* ------------------------------------------------------------------
   Catalog matching — runs client-side for speed
   ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  "the","and","for","from","with","hand","rolled","made","since","est",
  "republic","republica","dominicana","dominican","cuba","cubana","body",
  "medium","full","light","natural","colorado","claro","oscuro","premium",
  "cigar","cigars","tobacco","blend","wrapper","binder","filler",
  "honduras","nicaragua","mexico","ecuador","cameroon","brazil","indonesia",
  "connecticut","habano","corojo","criollo",
]);

async function matchCatalog(ocrText: string): Promise<CatalogResult[]> {
  const words = ocrText
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .slice(0, 8);

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
      "id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url"
    )
    .or(orFilter)
    .order("usage_count", { ascending: false })
    .limit(20);

  if (!data?.length) return [];

  type Scored = CatalogResult & { _score: number };
  const scored: Scored[] = data.map((cigar) => {
    const brand         = (cigar.brand  ?? "").toLowerCase();
    const seriesFormat  = `${cigar.series ?? ""} ${cigar.format ?? ""}`.toLowerCase();

    // Brand hits worth 3×, series/format hits worth 2×
    const brandHits        = words.filter((w) => brand.includes(w)).length;
    const seriesFormatHits = words.filter((w) => seriesFormat.includes(w)).length;
    // Bonus if a word is an exact full match for the brand
    const brandExact       = words.some((w) => brand === w) ? 3 : 0;

    return {
      ...(cigar as CatalogResult),
      _score: brandHits * 3 + seriesFormatHits * 2 + brandExact,
    };
  });

  return scored
    .filter((c) => c._score >= 2)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5)
    .map(({ _score, ...rest }) => rest as CatalogResult);
}

/* ------------------------------------------------------------------
   Image capture — resize to ≤ 800 px before encoding
   ------------------------------------------------------------------ */

function captureImage(video: HTMLVideoElement): string {
  const MAX = 800;
  const ratio = Math.min(MAX / video.videoWidth, MAX / video.videoHeight, 1);
  const w = Math.round(video.videoWidth  * ratio);
  const h = Math.round(video.videoHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/* ------------------------------------------------------------------
   CigarBandScanner
   ------------------------------------------------------------------ */

export function CigarBandScanner({ onClose, onAdded, onSearch }: Props) {
  const [phase,         setPhase]         = useState<Phase>("requesting");
  const [statusText,    setStatusText]    = useState("Initializing camera…");
  const [matches,       setMatches]       = useState<CatalogResult[]>([]);
  const [addCigarId,    setAddCigarId]    = useState<string | null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* ── Camera lifecycle ───────────────────────────────────────────── */

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
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
        setPhase("no_match");
        return;
      }

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
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
              transform: "translate(-50%, -50%) translateY(-10%)",
              width:     "min(80vw, 300px)",
              height:    "min(80vw, 300px)",
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
                  onClick={() => { onClose(); onSearch(); }}
                >
                  Search Catalog Instead
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
                  {matches.length === 1 ? "Match Found" : `${matches.length} Possible Matches`}
                </p>

                <div className="space-y-2">
                  {matches.map((cigar) => (
                    <button
                      key={cigar.id}
                      type="button"
                      onClick={() => setAddCigarId(cigar.id)}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left"
                      style={{
                        backgroundColor: "var(--secondary)",
                        border:          "1px solid var(--border)",
                        cursor:          "pointer",
                        touchAction:     "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {/* Cigar image */}
                      <div
                        className="rounded-lg overflow-hidden flex-shrink-0"
                        style={{ width: 52, height: 52 }}
                      >
                        <CigarImage
                          imageUrl={cigar.image_url}
                          wrapper={cigar.wrapper}
                          alt={cigar.series ?? cigar.format ?? ""}
                          width={52}
                          height={52}
                          sizes="52px"
                          quality={75}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted-foreground)" }}>
                          {cigar.brand}
                        </p>
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
                          {cigar.series ?? cigar.format}
                        </p>
                        {cigar.format && (
                          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{cigar.format}</p>
                        )}
                      </div>

                      {/* Add indicator */}
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-full"
                        style={{ width: 32, height: 32, backgroundColor: "rgba(212,160,74,0.15)" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M7 2v10M2 7h10" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>

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

      {/* AddToHumidor sheet for selected match */}
      {addCigarId && (
        <AddToHumidorSheet
          cigarId={addCigarId}
          isOpen={true}
          onClose={() => setAddCigarId(null)}
          onSuccess={() => {
            setAddCigarId(null);
            stopCamera();
            onAdded();
            onClose();
          }}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
