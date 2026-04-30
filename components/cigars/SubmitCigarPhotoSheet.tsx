"use client";

import { useRef, useState } from "react";
import { createPortal }     from "react-dom";

interface Props {
  cigarId:   string;
  cigarName: string;
  onClose:   () => void;
}

export function SubmitCigarPhotoSheet({ cigarId, cigarName, onClose }: Props) {
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [file,        setFile]          = useState<File | null>(null);
  const [preview,     setPreview]       = useState<string | null>(null);
  const [submitting,  setSubmitting]    = useState(false);
  const [error,       setError]         = useState<string | null>(null);
  const [submitted,   setSubmitted]     = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function handleSubmit() {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData();
    fd.append("file",     file);
    fd.append("cigar_id", cigarId);

    const res = await fetch("/api/upload/cigar-image", { method: "POST", body: fd });
    setSubmitting(false);

    if (res.ok) {
      setSubmitted(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed. Please try again.");
    }
  }

  const modal = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          backgroundColor: "rgba(0,0,0,0.65)",
        }}
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
          borderRadius:    "16px 16px 0 0",
          border:          "1px solid var(--border)",
          borderBottom:    "none",
          padding:         "24px 20px 36px",
          maxWidth:        560,
          margin:          "0 auto",
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />

        {submitted ? (
          /* ── Success state ────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "rgba(212,160,74,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="var(--gold,#D4A04A)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Photo submitted
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                Your photo will be reviewed and published if approved.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--gold,#D4A04A)", color: "#1A1210", border: "none", cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Upload form ──────────────────────────────────────── */
          <>
            <h2
              className="text-base font-semibold mb-1"
              style={{ fontFamily: "var(--font-serif)", color: "var(--foreground)" }}
            >
              Submit a Photo
            </h2>
            <p className="text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>
              {cigarName} &middot; Photos are reviewed before going live.
            </p>

            {/* Preview or pick area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width:           "100%",
                aspectRatio:     "4/3",
                borderRadius:    12,
                border:          `1px dashed ${preview ? "transparent" : "var(--border)"}`,
                background:      preview ? "transparent" : "rgba(255,255,255,0.03)",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                cursor:          "pointer",
                overflow:        "hidden",
                marginBottom:    16,
                position:        "relative",
              }}
            >
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={preview}
                  alt="Preview"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                      stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Tap to choose a photo
                  </span>
                </div>
              )}
            </div>

            {preview && (
              <button
                type="button"
                onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="text-xs mb-4"
                style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Choose a different photo
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {error && (
              <p className="text-xs mb-3" style={{ color: "#E8642C" }}>{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background:  "transparent",
                  border:      "1px solid var(--border)",
                  color:       "var(--muted-foreground)",
                  cursor:      "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!file || submitting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background:  file && !submitting ? "var(--gold,#D4A04A)" : "rgba(212,160,74,0.3)",
                  color:       "#1A1210",
                  border:      "none",
                  cursor:      file && !submitting ? "pointer" : "default",
                }}
              >
                {submitting ? "Submitting..." : "Submit Photo"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  return typeof window !== "undefined" ? createPortal(modal, document.body) : null;
}
