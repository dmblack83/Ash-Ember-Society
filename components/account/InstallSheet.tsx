"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { InstallPlatform } from "@/lib/install-prompt";

/* ------------------------------------------------------------------
   InstallSheet

   Bottom sheet with platform-specific install instructions.

     ios-safari → 3-step Add-to-Home-Screen guide pointing at the
                   Share button at the bottom of the screen.
     ios-other  → "Open in Safari first" copy with the same 3 steps.
                   (We don't try to programmatically open Safari —
                   x-safari-https:// only works in some non-Safari
                   browsers and silently fails in others.)
     android    → captures BeforeInstallPromptEvent on parent and
                   fires it via onPromptInstall when the user taps
                   "Install on Android". Falls back to manual
                   instructions when the event isn't available
                   (e.g., user previously dismissed it).

   Renders into document.body via portal so it overlays nav and
   sticky headers cleanly.
   ------------------------------------------------------------------ */

interface Props {
  platform:        InstallPlatform;
  onClose:         () => void;
  /** Android only: true when a BeforeInstallPromptEvent was captured. */
  androidPromptAvailable?: boolean;
  /** Android only: fires the captured prompt; resolves to outcome. */
  onPromptInstall?: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const STEPS_SAFARI = [
  { num: "1", text: "Tap the Share button at the bottom of the screen." },
  { num: "2", text: 'Scroll and tap "Add to Home Screen".' },
  { num: "3", text: 'Tap "Add" in the top right.' },
] as const;

const STEPS_NON_SAFARI = [
  { num: "1", text: "Open ashember.vip in Safari." },
  { num: "2", text: "Tap the Share button at the bottom of the screen." },
  { num: "3", text: 'Tap "Add to Home Screen", then "Add".' },
] as const;

/* Manual fallback for Android when the deferred prompt isn't
   available (event already fired and dismissed, or browser doesn't
   surface one). */
const STEPS_ANDROID_MANUAL = [
  { num: "1", text: "Tap the ⋮ menu in the top right of Chrome." },
  { num: "2", text: 'Tap "Install app" or "Add to Home screen".' },
  { num: "3", text: 'Tap "Install" to confirm.' },
] as const;

function ShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.5v10M6 6l4-3.5L14 6M5 9.5h-.5A1.5 1.5 0 0 0 3 11v5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 16v-5a1.5 1.5 0 0 0-1.5-1.5H15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 3v11M4 10l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InstallSheet({
  platform,
  onClose,
  androidPromptAvailable = false,
  onPromptInstall,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while the sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const isSafari  = platform === "ios-safari";
  const isAndroid = platform === "android";
  // Android with a captured deferred prompt has its own flow (no
  // step list — the OS modal handles it). Without a captured prompt
  // we show manual menu instructions.
  const showAndroidPrompt = isAndroid && androidPromptAvailable;
  const steps = isSafari
    ? STEPS_SAFARI
    : isAndroid
      ? STEPS_ANDROID_MANUAL
      : STEPS_NON_SAFARI;

  const heading = isSafari
    ? "Add Ash & Ember to your Home Screen"
    : isAndroid
      ? "Install Ash & Ember"
      : "Open in Safari to install";

  const subheading = isSafari
    ? "Get a faster, app-like experience in one tap."
    : isAndroid
      ? showAndroidPrompt
        ? "One tap to install. Get a faster, app-like experience."
        : "Install from Chrome's menu — it's only a few taps."
      : "Adding to the Home Screen is only available from Safari on iOS.";

  async function handleAndroidInstall() {
    if (!onPromptInstall || installing) return;
    setInstalling(true);
    const outcome = await onPromptInstall();
    setInstalling(false);
    if (outcome === "accepted" || outcome === "dismissed") {
      // Either way, the captured event is consumed — close the sheet.
      onClose();
    }
    // "unavailable" leaves the sheet open so the user can read the
    // manual fallback instructions, which the parent will now show
    // since androidPromptAvailable flipped to false.
  }

  return createPortal(
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          10000,
          backgroundColor: "rgba(0,0,0,0.6)",
          backdropFilter:  "blur(2px)",
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-heading"
        style={{
          position:                "fixed",
          left:                    0,
          right:                   0,
          bottom:                  0,
          zIndex:                  10001,
          backgroundColor:         "var(--card)",
          borderTopLeftRadius:     20,
          borderTopRightRadius:    20,
          borderTop:               "1px solid var(--border)",
          maxHeight:               "85vh",
          overflowY:               "auto",
          paddingBottom:           "calc(28px + env(safe-area-inset-bottom))",
          animation:               "install-sheet-up 220ms ease-out",
        }}
      >
        <style>{`
          @keyframes install-sheet-up {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
          <div
            style={{
              width:           36,
              height:          4,
              borderRadius:    2,
              backgroundColor: "var(--border)",
            }}
          />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-2">
          <h2
            id="install-sheet-heading"
            className="font-serif"
            style={{
              fontSize:   22,
              fontWeight: 700,
              color:      "var(--foreground)",
              margin:     0,
              lineHeight: 1.25,
            }}
          >
            {heading}
          </h2>
          <p
            style={{
              fontSize:   13,
              color:      "var(--muted-foreground)",
              marginTop:  6,
              lineHeight: 1.5,
            }}
          >
            {subheading}
          </p>
        </div>

        {/* Android with a captured prompt: single Install button.
            Skip the steps entirely — Chrome's modal IS the flow. */}
        {showAndroidPrompt && (
          <div className="px-6 pt-4 pb-2">
            <button
              type="button"
              onClick={handleAndroidInstall}
              disabled={installing}
              className="w-full rounded-full"
              style={{
                minHeight:               48,
                background:              installing ? "rgba(212,160,74,0.5)" : "linear-gradient(135deg, #D4A04A, #C17817)",
                color:                   "#1A1210",
                border:                  "none",
                fontWeight:              600,
                fontSize:                14,
                cursor:                  installing ? "default" : "pointer",
                touchAction:             "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {installing ? "Opening prompt…" : "Install Ash & Ember"}
            </button>
          </div>
        )}

        {/* Steps — shown for both iOS variants and Android-manual */}
        {!showAndroidPrompt && (
        <ol
          className="px-6 pt-4 pb-2"
          style={{
            listStyle:     "none",
            padding:       "16px 24px 8px",
            margin:        0,
            display:       "flex",
            flexDirection: "column",
            gap:           14,
          }}
        >
          {steps.map((step) => (
            <li key={step.num} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink:      0,
                  width:           28,
                  height:          28,
                  borderRadius:    "50%",
                  backgroundColor: "rgba(212,160,74,0.15)",
                  color:           "var(--gold, #D4A04A)",
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                  fontWeight:      700,
                  fontSize:        13,
                  fontFamily:      "var(--font-serif)",
                }}
              >
                {step.num}
              </span>
              <span
                style={{
                  fontSize:   14.5,
                  lineHeight: 1.5,
                  color:      "var(--foreground)",
                  paddingTop: 3,
                }}
              >
                {step.text}
              </span>
            </li>
          ))}
        </ol>
        )}

        {/* Visual hint — only on iOS Safari, where the Share button
            actually lives at the bottom of the screen */}
        {isSafari && (
          <div className="px-6 pt-2 pb-4">
            <div
              style={{
                display:         "flex",
                alignItems:      "center",
                gap:             10,
                padding:         "12px 16px",
                borderRadius:    12,
                backgroundColor: "rgba(212,160,74,0.08)",
                border:          "1px solid rgba(212,160,74,0.18)",
                color:           "var(--gold, #D4A04A)",
                fontSize:        12.5,
                fontWeight:      500,
                lineHeight:      1.4,
              }}
            >
              <ShareIcon />
              <span style={{ flex: 1 }}>The Share button looks like this — bottom of the screen.</span>
              <DownArrow />
            </div>
          </div>
        )}

        {/* Dismiss */}
        <div className="px-6 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full"
            style={{
              minHeight:               48,
              background:              "var(--secondary)",
              color:                   "var(--foreground)",
              border:                  "1px solid var(--border)",
              fontWeight:              600,
              fontSize:                14,
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
