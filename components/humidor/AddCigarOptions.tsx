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

      {/* Centered modal — 75vw on mobile, 360px on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add cigar"
        style={{
          position:        "fixed",
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          zIndex:          9999,
          width:           "min(75vw, 360px)",
          backgroundColor: "var(--card)",
          borderRadius:    20,
          border:          "1px solid var(--border)",
          padding:         "24px 20px 20px",
        }}
      >
        <p
          className="text-center text-sm font-semibold pb-4"
          style={{ color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}
        >
          Add Cigar
        </p>

        <div className="space-y-3">
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
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Browse by brand, series, wrapper, vitola, and more</p>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 text-sm"
          style={{ color: "var(--muted-foreground)", padding: "8px 0", cursor: "pointer", background: "none", border: "none" }}
        >
          Cancel
        </button>
      </div>
    </>,
    document.body
  );
}
