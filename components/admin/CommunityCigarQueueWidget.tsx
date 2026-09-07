"use client";

import { useState } from "react";
import { sizeDims } from "@/lib/cigars/line-group";

/* ------------------------------------------------------------------
   Community Cigars queue — member-added catalog lines awaiting
   review. Approve clears the "pending review" badge on the line and
   every size; Delete removes unreferenced entries (the API refuses
   when a member's humidor or burn log uses one).
   ------------------------------------------------------------------ */

export interface PendingCommunityLine {
  id:         string;          // cigar_lines.id
  brand:      string;
  series:     string | null;
  wrapper:    string | null;
  created_at: string;
  sizes: {
    id:             string;
    format:         string | null;
    ring_gauge:     number | null;
    length_inches:  number | null;
  }[];
}

interface Props {
  initialLines: PendingCommunityLine[];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CommunityCigarQueueWidget({ initialLines }: Props) {
  const [lines,  setLines]  = useState(initialLines);
  const [acting, setActing] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  async function handleAction(id: string, action: "approve" | "delete") {
    setActing(id);
    setError(null);
    const res = await fetch(`/api/admin/community-cigars/${id}`, action === "approve"
      ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }
      : { method: "DELETE" });
    setActing(null);
    if (res.ok) {
      setLines((prev) => prev.filter((l) => l.id !== id));
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
          Community Cigars
        </span>
        {lines.length > 0 && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "var(--ember,#E8642C)", color: "#fff" }}
          >
            {lines.length}
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs px-5 pt-3" style={{ color: "#E8642C" }}>{error}</p>
      )}

      {lines.length === 0 ? (
        <p className="text-xs px-5 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>
          No pending community cigars.
        </p>
      ) : (
        <div>
          {lines.map((l, i) => (
            <div
              key={l.id}
              style={{
                padding:   "16px 20px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                {l.brand}
              </p>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
                {l.series ?? l.brand}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {[
                  l.wrapper,
                  l.sizes.map((s) => [s.format, sizeDims(s)].filter(Boolean).join(" ")).filter(Boolean).join(", ") || null,
                ].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {relativeTime(l.created_at)}
              </p>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => handleAction(l.id, "approve")}
                  disabled={!!acting}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: acting ? "rgba(212,160,74,0.3)" : "var(--gold,#D4A04A)",
                    color:      "#1A1210",
                    border:     "none",
                    cursor:     acting ? "default" : "pointer",
                  }}
                >
                  {acting === l.id ? "..." : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(l.id, "delete")}
                  disabled={!!acting}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: "transparent",
                    color:      "#E8642C",
                    border:     "1px solid rgba(232,100,44,0.4)",
                    cursor:     acting ? "default" : "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
