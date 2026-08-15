"use client";

import { useRouter } from "next/navigation";
import { relativeBurnTime, yearsAgoLabel, nudgeLine } from "@/lib/home/last-burn";
import { ratingColor, ratingLabel } from "@/lib/rating";
import { IntentLink } from "@/components/ui/IntentLink";
import type { LastBurnBundle, LastBurnLog } from "@/lib/data/last-burn-client";

/* ------------------------------------------------------------------
   LastBurn — home dashboard card.

   Two everyday faces (quick log / full report) plus an On This Day
   anniversary face that takes the slot when a past-year log matches
   today's month + day. Structure and copy rules per
   mockups/home-ux/last-burn.html and the Task 3 brief. Renders null
   with no smoke logs at all.
   ------------------------------------------------------------------ */

const NUDGE_DAYS_THRESHOLD = 30;

function daysSinceLocal(ymd: string, now: Date = new Date()): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - then) / 86_400_000);
}

function absoluteDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function SubChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      style={{
        fontFamily:    "var(--font-mono)",
        fontSize:      8.5,
        letterSpacing: "0.08em",
        color:         "var(--paper-mute)",
        background:    "var(--background)",
        border:        "1px solid var(--line-soft)",
        borderRadius:  5,
        padding:       "3px 7px",
      }}
    >
      {label} <b style={{ color: "var(--foreground)", fontWeight: 600 }}>{value}</b>
    </span>
  );
}

export function LastBurn({ bundle, readyCount }: { bundle: LastBurnBundle; readyCount: number }) {
  const router = useRouter();

  if (bundle.latest == null) return null;

  const log: LastBurnLog = bundle.onThisDay ?? bundle.latest;
  const isOtd = bundle.onThisDay != null;
  const showBridge = isOtd && bundle.onThisDay!.id !== bundle.latest.id;

  const name = log.cigar.series ?? log.cigar.format ?? "";
  const score = log.overall_rating;
  const scoreColor = score != null ? ratingColor(score) : "var(--paper-dim)";

  const metaParts: string[] = [];
  if (isOtd) metaParts.push(yearsAgoLabel(log.smoked_at));
  metaParts.push(log.isFullReport ? "Full report" : "Quick log");
  if (!isOtd) metaParts.push(absoluteDate(log.smoked_at));
  if (log.smoke_duration_minutes != null) metaParts.push(formatDuration(log.smoke_duration_minutes));
  if (log.pairing_drink) metaParts.push(log.pairing_drink);

  const hasSubs = log.isFullReport
    && (log.draw_rating != null || log.burn_rating != null || log.construction_rating != null);

  const target = log.humidor_item_id ? `/humidor/${log.humidor_item_id}` : "/humidor/burn-reports";

  const isNudgeDue = daysSinceLocal(bundle.latest.smoked_at) > NUDGE_DAYS_THRESHOLD && readyCount >= 1;

  return (
    <section
      aria-label={`Last burn: ${name}`}
      onClick={() => router.push(target)}
      className="animate-fade-in"
      style={{
        position:     "relative",
        border:       `1px solid ${isOtd ? "rgba(212,160,74,.45)" : "var(--card-border, var(--line-soft))"}`,
        borderRadius: 10,
        background:   "var(--card)",
        padding:      "16px 16px 14px",
        overflow:     "hidden",
        cursor:       "pointer",
      }}
    >
      {isOtd && (
        <div
          aria-hidden="true"
          style={{
            position:      "absolute",
            top:           0,
            right:         0,
            width:         120,
            height:        120,
            background:    "radial-gradient(ellipse at top right, rgba(212,160,74,.14), transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Eyebrow */}
      <div
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color:         "var(--gold)",
          display:       "flex",
          alignItems:    "center",
          gap:           10,
          marginBottom:  12,
        }}
      >
        {isOtd ? "On This Day" : "The Last Burn"}
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ letterSpacing: "0.14em", color: isOtd ? "var(--gold)" : "var(--paper-dim)" }}>
          {isOtd ? log.smoked_at.slice(0, 4) : relativeBurnTime(log.smoked_at)}
        </span>
      </div>

      {/* Main row */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 auto", textAlign: "center" }}>
          <div
            style={{
              fontFamily:    "var(--font-serif)",
              fontStyle:     "italic",
              fontWeight:    500,
              fontSize:      46,
              lineHeight:    0.9,
              letterSpacing: "-0.02em",
              color:         scoreColor,
            }}
          >
            {score != null ? score : "–"}
          </div>
          {score != null && (
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   12,
                marginTop:  5,
                color:      scoreColor,
              }}
            >
              {ratingLabel(score)}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div
            style={{
              fontSize:      9.5,
              fontWeight:    500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         "var(--paper-mute)",
            }}
          >
            {log.cigar.brand ?? ""}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, marginTop: 2 }}>
            {name}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--paper-dim)", marginTop: 4 }}>
            {metaParts.join(" · ")}
          </div>
          {hasSubs && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {log.draw_rating != null && <SubChip label="Draw" value={log.draw_rating} />}
              {log.burn_rating != null && <SubChip label="Burn" value={log.burn_rating} />}
              {log.construction_rating != null && <SubChip label="Constr." value={log.construction_rating} />}
            </div>
          )}
        </div>
      </div>

      {/* Notes quote */}
      {log.review_text && (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   14,
            color:      "var(--paper-mute)",
            lineHeight: 1.45,
            marginTop:  12,
            display:            "-webkit-box",
            WebkitLineClamp:    2,
            WebkitBoxOrient:    "vertical",
            overflow:           "hidden",
          }}
        >
          &ldquo;{log.review_text}&rdquo;
        </p>
      )}

      {/* Footer */}
      {showBridge ? (
        <div
          style={{
            marginTop:   12,
            paddingTop:  11,
            borderTop:   "1px solid var(--line-soft)",
            minHeight:   24,
            display:     "flex",
            alignItems:  "center",
            fontSize:    10.5,
            color:       "var(--paper-dim)",
          }}
        >
          Your last burn was {relativeBurnTime(bundle.latest.smoked_at)}
          {" · "}
          <IntentLink
            href={bundle.latest.humidor_item_id ? `/humidor/${bundle.latest.humidor_item_id}` : "/humidor/burn-reports"}
            onClick={(e) => e.stopPropagation()}
            style={{ color: "var(--gold)", textDecoration: "none", marginLeft: 4 }}
          >
            see it &rsaquo;
          </IntentLink>
        </div>
      ) : (
        <div
          style={{
            marginTop:      12,
            paddingTop:     11,
            borderTop:      "1px solid var(--line-soft)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            minHeight:      24,
            gap:            10,
          }}
        >
          {log.video ? (
            <a
              href={`https://www.youtube.com/watch?v=${log.video.youtube_video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display:       "inline-flex",
                alignItems:    "center",
                gap:           5,
                fontFamily:    "var(--font-mono)",
                fontSize:      8.5,
                letterSpacing: "0.08em",
                color:         "#FF4444",
                border:        "1px solid rgba(255,0,0,.35)",
                borderRadius:  999,
                padding:       "3px 8px",
                textDecoration: "none",
                whiteSpace:    "nowrap",
              }}
            >
              &#9658; Watch review
            </a>
          ) : isNudgeDue ? (
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   10.5,
                color:      "var(--paper-dim)",
              }}
            >
              It has been a while. {nudgeLine(readyCount)}
            </span>
          ) : log.isFullReport && log.flavorNames.length > 0 ? (
            <div style={{ display: "flex", gap: 5, minWidth: 0, overflow: "hidden" }}>
              {log.flavorNames.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontFamily:    "var(--font-mono)",
                    fontSize:      8,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color:         "var(--gold-deep)",
                    border:        "1px solid rgba(212,160,74,.3)",
                    borderRadius:  999,
                    padding:       "3px 8px",
                    whiteSpace:    "nowrap",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}

          <IntentLink
            href="/humidor/burn-reports"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color:         "var(--gold)",
              whiteSpace:    "nowrap",
              flexShrink:    0,
              textDecoration: "none",
            }}
          >
            Burn history &rsaquo;
          </IntentLink>
        </div>
      )}
    </section>
  );
}
