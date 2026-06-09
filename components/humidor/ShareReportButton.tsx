"use client";

import { useState, useEffect } from "react";

interface ShareReportButtonProps {
  reportId:     string;
  reportNumber: number;
  cigarLabel:   string;
}

type State = "idle" | "loading" | "error";

export function ShareReportButton({ reportId, reportNumber, cigarLabel }: ShareReportButtonProps) {
  const [state,    setState]    = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Prefetch both images the moment the button renders (i.e. when the report modal
  // opens). The responses are cached by the browser (Cache-Control: private,
  // max-age=300). When the user taps Share the fetch returns instantly from cache,
  // keeping the navigator.share() call inside iOS's user-activation window.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetch(`/api/burn-report/${reportId}/share-image?page=1`, { signal }).catch(() => {});
    fetch(`/api/burn-report/${reportId}/share-image?page=2`, { signal }).catch(() => {});
    return () => controller.abort();
  }, [reportId]);

  async function handleShare() {
    if (state === "loading") return;
    setState("loading");
    setErrorMsg(null);

    let stateSet = false;
    const finish = (next: State, msg?: string) => {
      stateSet = true;
      if (next === "error") {
        setState("error");
        if (msg) setErrorMsg(msg);
        setTimeout(() => { setState("idle"); setErrorMsg(null); }, 3000);
      } else {
        setState("idle");
      }
    };

    try {
      const [res1, res2] = await Promise.all([
        fetch(`/api/burn-report/${reportId}/share-image?page=1`),
        fetch(`/api/burn-report/${reportId}/share-image?page=2`),
      ]);
      if (!res1.ok) throw new Error("Failed to generate image");
      const blob1 = await res1.blob();
      const blob2 = res2.status === 200 ? await res2.blob() : null;

      const name1  = `burn-report-${reportNumber}-p1.png`;
      const name2  = `burn-report-${reportNumber}-p2.png`;
      const file1  = new File([blob1], name1, { type: "image/png" });
      const files  = blob2
        ? [file1, new File([blob2], name2, { type: "image/png" })]
        : [file1];
      const title = `${cigarLabel} - Burn Report #${reportNumber}`;

      // Web Share API — skipping canShare() pre-check because it returns false in
      // iOS PWA mode for files below iOS 16.4, causing the wrong fallback path.
      // Let navigator.share() itself decide; catch any non-abort failure below.
      if (typeof navigator?.share === "function") {
        try {
          await navigator.share({ files, title });
          finish("idle");
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") { finish("idle"); return; }
          // navigator.share failed for a reason other than user dismissal —
          // fall through to download fallback below.
        }
      }

      // Fallback: trigger <a download> for desktop browsers
      const triggerDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a   = Object.assign(document.createElement("a"), { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
      triggerDownload(blob1, name1);
      if (blob2) setTimeout(() => triggerDownload(blob2, name2), 200);
      finish("idle");

    } catch (err) {
      finish("error", err instanceof Error ? err.message : "Could not generate image");
    } finally {
      // Safety net: if an unexpected exception bypassed every finish() call above,
      // ensure the button never stays locked in loading state.
      if (!stateSet) setState("idle");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "loading"}
        className="flex items-center justify-center rounded-full transition-opacity active:opacity-70"
        style={{
          width:       36,
          height:      36,
          border:      `1.5px solid ${state === "idle" ? "var(--gold)" : "var(--line-strong)"}`,
          color:       state === "loading" ? "var(--paper-mute)" : "var(--gold)",
          background:  "transparent",
          cursor:      state === "loading" ? "default" : "pointer",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        } as React.CSSProperties}
        aria-label="Save share image"
      >
        {state === "loading" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            className="animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeDasharray="30 30" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12M8 7l4-4 4 4"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {errorMsg && (
        <p className="text-xs" style={{ color: "var(--paper-mute)" }}>{errorMsg}</p>
      )}
    </div>
  );
}
