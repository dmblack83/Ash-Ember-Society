"use client";

import { useState, useEffect } from "react";
import { createPortal }        from "react-dom";

interface Props {
  onScan:   () => void;
  onSearch: () => void;
  onClose:  () => void;
}

export function AddCigarOptions({ onScan, onSearch, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 9998, backgroundColor: "rgba(0,0,0,0.6)" }}
      />

      {/* Sheet */}
      <div
        style={{
          position:        "fixed",
          bottom:          0,
          left:            0,
          right:           0,
          zIndex:          9999,
          backgroundColor: "var(--card)",
          borderRadius:    "20px 20px 0 0",
          paddingBottom:   "env(safe-area-inset-bottom)",
        }}
      >
        {/* Handle */}
        <div style={{ position: "relative", height: 32 }}>
          <div
            style={{
              position:        "absolute",
              top:             10,
              left:            "50%",
              transform:       "translateX(-50%)",
              width:           36,
              height:          4,
              borderRadius:    2,
              backgroundColor: "rgba(255,255,255,0.15)",
            }}
          />
        </div>

        <div className="px-5 pb-6 space-y-3">
          <p
            className="text-center text-sm font-semibold pb-1"
            style={{ color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}
          >
            Add Cigar
          </p>

          {/* Scan */}
          <button
            type="button"
            onClick={onScan}
            className="w-full flex items-center gap-4 rounded-2xl px-5"
            style={{
              height:          72,
              backgroundColor: "var(--secondary)",
              border:          "1px solid var(--border)",
              textAlign:       "left",
              cursor:          "pointer",
              touchAction:     "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 44, height: 44, backgroundColor: "rgba(212,160,74,0.15)" }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <rect x="2" y="6" width="18" height="12" rx="2.5" stroke="var(--gold)" strokeWidth="1.6"/>
                <circle cx="11" cy="12" r="3.5" stroke="var(--gold)" strokeWidth="1.5"/>
                <circle cx="11" cy="12" r="1.2" fill="var(--gold)"/>
                <path d="M7 6V4.5A1.5 1.5 0 018.5 3h5A1.5 1.5 0 0115 4.5V6" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Scan Cigar Band</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Use your camera to identify a cigar</p>
            </div>
          </button>

          {/* Search */}
          <button
            type="button"
            onClick={onSearch}
            className="w-full flex items-center gap-4 rounded-2xl px-5"
            style={{
              height:          72,
              backgroundColor: "var(--secondary)",
              border:          "1px solid var(--border)",
              textAlign:       "left",
              cursor:          "pointer",
              touchAction:     "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 44, height: 44, backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="6" stroke="var(--muted-foreground)" strokeWidth="1.6"/>
                <path d="M14 14l3.5 3.5" stroke="var(--muted-foreground)" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Search Catalog</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Browse 4,221 cigars by name or brand</p>
            </div>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
