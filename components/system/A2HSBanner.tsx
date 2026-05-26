"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY  = "ae:a2hs-dismissed";
const SNOOZE_MS    = 14 * 24 * 60 * 60 * 1000; // 14 days

function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIOS && !isStandalone;
}

function shouldShow(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (!val) return true;
    if (val === "permanent") return false;
    const ts = parseInt(val, 10);
    return !isNaN(ts) && Date.now() - ts > SNOOZE_MS;
  } catch {
    return false;
  }
}

export function A2HSBanner() {
  const [visible,     setVisible]     = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (isIOSSafari() && shouldShow()) setVisible(true);
  }, []);

  const dismiss = useCallback((permanent: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, permanent ? "permanent" : String(Date.now()));
    } catch { /* storage unavailable; banner stays hidden for this session */ }
    setVisible(false);
    setShowTooltip(false);
  }, []);

  const handleMainTap = useCallback(() => {
    setShowTooltip((p) => !p);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="complementary"
      aria-label="Install app"
      style={{
        position:   "fixed",
        bottom:     "calc(88px + env(safe-area-inset-bottom))",
        left:       0,
        right:      0,
        zIndex:     40,
        background: "#3D2E23",
        borderTop:  "1px solid rgba(255,255,255,0.08)",
        padding:    "10px 12px",
      }}
    >
      {/* Tooltip — shown when user taps the main area */}
      {showTooltip && (
        <div
          style={{
            position:     "absolute",
            bottom:       "100%",
            left:         "50%",
            transform:    "translateX(-50%)",
            marginBottom: 6,
            background:   "#241C17",
            border:       "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding:      "8px 12px",
            whiteSpace:   "nowrap",
            color:        "#F5E6D3",
            fontFamily:   "Inter, sans-serif",
            fontSize:     13,
          }}
        >
          Tap the share icon{" "}
          <span aria-hidden="true" style={{ fontSize: 15 }}>&#x2BAD;</span>
          {" "}then &quot;Add to Home Screen&quot;
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Tappable main area: share icon + text */}
        <button
          onClick={handleMainTap}
          aria-label="How to add to Home Screen"
          style={{
            display:         "flex",
            alignItems:      "center",
            gap:             10,
            flex:            1,
            background:      "none",
            border:          "none",
            padding:         0,
            cursor:          "pointer",
            WebkitTapHighlightColor: "transparent",
            textAlign:       "left",
          }}
        >
          {/* iOS share icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: 0, color: "#F5E6D3" }}
          >
            <path
              d="M10 2v10M6 6l4-4 4 4M4 13v4a1 1 0 001 1h10a1 1 0 001-1v-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize:   13,
              color:      "#F5E6D3",
              lineHeight: 1.4,
            }}
          >
            Add to Home Screen for the full experience
          </span>
        </button>

        {/* "Not now" — snooze 14 days */}
        <button
          onClick={() => dismiss(false)}
          aria-label="Not now"
          style={{
            background:  "none",
            border:      "none",
            padding:     "4px 6px",
            cursor:      "pointer",
            color:       "#A69080",
            fontFamily:  "Inter, sans-serif",
            fontSize:    12,
            flexShrink:  0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Not now
        </button>

        {/* "×" — dismiss permanently */}
        <button
          onClick={() => dismiss(true)}
          aria-label="Dismiss permanently"
          style={{
            background:  "none",
            border:      "none",
            padding:     "4px 6px",
            cursor:      "pointer",
            color:       "#A69080",
            fontFamily:  "Inter, sans-serif",
            fontSize:    18,
            lineHeight:  1,
            flexShrink:  0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}
