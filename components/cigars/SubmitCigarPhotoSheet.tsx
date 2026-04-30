"use client";

import { useRef, useState } from "react";
import { createPortal }     from "react-dom";

interface Props {
  cigarId:   string;
  cigarName: string;
  onClose:   () => void;
}

export function SubmitCigarPhotoSheet({ cigarId, cigarName, onClose }: Props) {
  const fileInputRef                 = useRef<HTMLInputElement>(null);
  const [file,       setFile]        = useState<File | null>(null);
  const [preview,    setPreview]     = useState<string | null>(null);
  const [submitting, setSubmitting]  = useState(false);
  const [error,      setError]       = useState<string | null>(null);
  const [submitted,  setSubmitted]   = useState(false);

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
          position:        "fixed",
          inset:           0,
          zIndex:          9998,
          backgroundColor: "rgba(0,0,0,0.72)",
        }}
      />

      {/* Centered modal */}
      <div
        style={{
          position:        "fixed",
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          zIndex:          9999,
          width:           "calc(100% - 40px)",
          maxWidth:        480,
          maxHeight:       "90dvh",
          overflowY:       "auto",
          backgroundColor: "var(--card)",
          borderRadius:    20,
          border:          "1px solid var(--border)",
          padding:         "28px 24px 28px",
        }}
      >
        {submitted ? (
          /* ── Success ──────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              style={{
                width:        56,
                height:       56,
                borderRadius: "50%",
                background:   "rgba(212,160,74,0.15)",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="var(--gold,#D4A04A)" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Photo contributed
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                Your photo will be reviewed and published if approved.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-2.5 rounded-xl text-sm font-semibold mt-2"
              style={{ background: "var(--gold,#D4A04A)", color: "#1A1210", border: "none", cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Upload form ──────────────────────────────────────── */
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2
                  className="text-base font-semibold mb-1"
                  style={{ fontFamily: "var(--font-serif)", color: "var(--foreground)" }}
                >
                  Contribute a Photo
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)", maxWidth: 320 }}>
                  Help the community with a better look at this cigar. Photos are reviewed before going live.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  flexShrink:  0,
                  marginLeft:  12,
                  width:       32,
                  height:      32,
                  borderRadius: "50%",
                  background:  "rgba(255,255,255,0.07)",
                  border:      "1px solid var(--border)",
                  color:       "var(--muted-foreground)",
                  cursor:      "pointer",
                  display:     "flex",
                  alignItems:  "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Photo pick / preview */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width:          "100%",
                minHeight:      260,
                borderRadius:   14,
                border:         `1.5px dashed ${preview ? "rgba(212,160,74,0.4)" : "var(--border)"}`,
                background:     preview ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.02)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                cursor:         "pointer",
                overflow:       "hidden",
                marginBottom:   preview ? 10 : 20,
                position:       "relative",
              }}
            >
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={preview}
                  alt="Preview"
                  style={{ width: "100%", height: "100%", objectFit: "contain", maxHeight: 340 }}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-10">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                      stroke="var(--muted-foreground)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                    Tap to choose a photo
                  </span>
                  <span className="text-xs" style={{ color: "rgba(166,144,128,0.6)" }}>
                    JPEG, PNG or WebP &middot; up to 10 MB
                  </span>
                </div>
              )}
            </div>

            {preview && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs mb-4 block"
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

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: "transparent",
                  border:     "1px solid var(--border)",
                  color:      "var(--muted-foreground)",
                  cursor:     "pointer",
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
                  background: file && !submitting ? "var(--gold,#D4A04A)" : "rgba(212,160,74,0.3)",
                  color:      "#1A1210",
                  border:     "none",
                  cursor:     file && !submitting ? "pointer" : "default",
                }}
              >
                {submitting ? "Submitting..." : "Contribute Photo"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  return typeof window !== "undefined" ? createPortal(modal, document.body) : null;
}
