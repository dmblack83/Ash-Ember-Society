"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ShareReportButtonProps {
  reportId:     string;
  reportNumber: number;
  cigarLabel:   string;
}

// "preparing" — fetching + decoding the share images into File objects.
// "ready"     — File[] resolved and held in a ref; a tap can share synchronously.
// "error"     — prefetch failed; tapping retries.
type State = "preparing" | "ready" | "error";

/**
 * iOS WebKit only opens the native share sheet when navigator.share() runs
 * synchronously inside the tap's user-activation window. Any slow await between
 * the tap and share() (a Satori+Sharp render can take seconds) lets activation
 * expire, WebKit rejects the share, and iOS silently falls back to opening the
 * PNG in Quick Look — or, in a standalone PWA, does nothing.
 *
 * So we resolve the File objects up front (on mount, while the modal is open),
 * hold them in a ref, and keep the button disabled until they're ready. The tap
 * handler then calls navigator.share() with ZERO awaits before it.
 */
export function ShareReportButton({ reportId, reportNumber, cigarLabel }: ShareReportButtonProps) {
  const [state,  setState]  = useState<State>("preparing");
  const filesRef            = useRef<File[] | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to retry after an error

  useEffect(() => {
    let cancelled = false;
    setState("preparing");
    filesRef.current = null;

    (async () => {
      try {
        const [res1, res2] = await Promise.all([
          fetch(`/api/burn-report/${reportId}/share-image?page=1`),
          fetch(`/api/burn-report/${reportId}/share-image?page=2`),
        ]);
        if (!res1.ok) throw new Error(`share-image page 1 returned ${res1.status}`);

        const blob1 = await res1.blob();
        const blob2 = res2.status === 200 ? await res2.blob() : null; // 204 = no page 2
        if (cancelled) return;

        const files = [
          new File([blob1], `burn-report-${reportNumber}-p1.png`, { type: "image/png" }),
        ];
        if (blob2) {
          files.push(new File([blob2], `burn-report-${reportNumber}-p2.png`, { type: "image/png" }));
        }

        filesRef.current = files;
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => { cancelled = true; };
  }, [reportId, reportNumber, attempt]);

  const handleClick = useCallback(() => {
    if (state === "error") { setAttempt((n) => n + 1); return; } // retry prefetch
    if (state !== "ready") return;                                // still preparing — ignore

    const files = filesRef.current;
    if (!files || files.length === 0) return;

    const title = `${cigarLabel} - Burn Report #${reportNumber}`;

    // Synchronous from here. No await precedes this navigator.share() call, so
    // the tap's user activation is still valid on iOS.
    const canShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare({ files }));

    if (canShare) {
      navigator.share({ files, title }).catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return; // user dismissed the sheet
        downloadFiles(files);                              // genuine failure → download
      });
      return;
    }

    // No Web Share API (desktop browsers) → download.
    downloadFiles(files);
  }, [state, cigarLabel, reportNumber]);

  const isPreparing = state === "preparing";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPreparing}
      className="flex items-center justify-center rounded-full transition-opacity active:opacity-70"
      style={{
        width:       36,
        height:      36,
        border:      `1.5px solid ${state === "ready" ? "var(--gold)" : "var(--line-strong)"}`,
        color:       state === "ready" ? "var(--gold)" : "var(--paper-mute)",
        background:  "transparent",
        cursor:      isPreparing ? "default" : "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties}
      aria-label={state === "error" ? "Retry preparing share image" : "Share burn report"}
    >
      {isPreparing ? (
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
  );
}

function downloadFiles(files: File[]) {
  files.forEach((file, i) => {
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const a   = Object.assign(document.createElement("a"), { href: url, download: file.name });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, i * 150);
  });
}
