"use client";

import { useState } from "react";
import Image from "next/image";

export interface PendingSubmission {
  id:          string;
  cigar_id:    string;
  cigar_brand: string | null;
  cigar_name:  string | null;
  submitter:   string | null;
  previewUrl:  string;       // signed URL, expires in 1hr
  created_at:  string;
}

interface Props {
  initialSubmissions: PendingSubmission[];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AdminTasksWidget({ initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [acting,      setActing]      = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  async function handleAction(id: string, action: "approve" | "reject") {
    setActing(id);
    setError(null);
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    setActing(null);
    if (res.ok) {
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Action failed.");
    }
  }

  return (
    <section
      style={{
        background:   "var(--card)",
        border:       "1px solid rgba(212,160,74,0.18)",
        borderRadius: 16,
        overflow:     "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      "20px 20px 14px",
          borderBottom: "1px solid var(--border)",
          display:      "flex",
          alignItems:   "center",
          gap:          10,
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          Photo Submissions
        </span>
        {submissions.length > 0 && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "var(--ember,#E8642C)", color: "#fff" }}
          >
            {submissions.length}
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs px-5 pt-3" style={{ color: "#E8642C" }}>{error}</p>
      )}

      {submissions.length === 0 ? (
        <p className="text-xs px-5 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>
          No pending submissions.
        </p>
      ) : (
        <div>
          {submissions.map((s, i) => (
            <div
              key={s.id}
              style={{
                display:     "flex",
                gap:         16,
                padding:     "16px 20px",
                borderTop:   i === 0 ? "none" : "1px solid var(--border)",
                alignItems:  "flex-start",
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width:        80,
                  height:       60,
                  borderRadius: 8,
                  overflow:     "hidden",
                  flexShrink:   0,
                  background:   "var(--muted)",
                }}
              >
                <Image
                  src={s.previewUrl}
                  alt="Submission"
                  width={80}
                  height={60}
                  sizes="80px"
                  quality={75}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>
                  {[s.cigar_brand, s.cigar_name].filter(Boolean).join(" ") || "Unknown cigar"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {s.submitter ?? "Member"} &middot; {relativeTime(s.created_at)}
                </p>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => handleAction(s.id, "approve")}
                    disabled={!!acting}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background:  acting ? "rgba(212,160,74,0.3)" : "var(--gold,#D4A04A)",
                      color:       "#1A1210",
                      border:      "none",
                      cursor:      acting ? "default" : "pointer",
                    }}
                  >
                    {acting === s.id ? "..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(s.id, "reject")}
                    disabled={!!acting}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background:  "transparent",
                      color:       "#E8642C",
                      border:      "1px solid rgba(232,100,44,0.4)",
                      cursor:      acting ? "default" : "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
