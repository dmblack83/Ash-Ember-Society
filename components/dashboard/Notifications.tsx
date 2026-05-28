"use client";

import { useState }   from "react";
import { useRouter }  from "next/navigation";
import useSWR         from "swr";
import { keyFor }     from "@/lib/data/keys";
import { fetchNotificationSummary } from "@/lib/data/notifications";
import type { NotificationSummaryRow } from "@/lib/data/notifications";

/* ------------------------------------------------------------------
   Row copy — singular/plural aware. No em dashes (user-facing).
   ------------------------------------------------------------------ */
function rowCopy(row: NotificationSummaryRow): string {
  const n = Number(row.unseen_count);
  if (row.kind === "participated") {
    return `${n} new repl${n === 1 ? "y" : "ies"} to you`;
  }
  return `${n} new comment${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------
   Single notification row (expanded only). Tapping clears + navigates.
   ------------------------------------------------------------------ */
function NotificationRow({
  row,
  onTap,
}: {
  row:   NotificationSummaryRow;
  onTap: (postId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTap(row.post_id)}
      className="w-full flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70"
      style={{
        minHeight:               44,
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        background:              "none",
        border:                  "none",
        padding:                 "10px 0",
        cursor:                  "pointer",
      } as React.CSSProperties}
      aria-label={`${row.title}: ${rowCopy(row)}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {row.title}
        </p>
        <p className="text-sm font-semibold text-foreground truncate leading-snug">
          {rowCopy(row)}
        </p>
      </div>
      <svg
        width="8"
        height="14"
        viewBox="0 0 8 14"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, color: "var(--gold)" }}
      >
        <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------
   Notifications — main export.

   Receives initial rows from the server island as fallbackData; SWR
   revalidates on focus and supplies optimistic mutate for dismiss.
   Chrome matches the Aging Shelf; collapsed by default.
   ------------------------------------------------------------------ */
export function Notifications({
  userId,
  initialItems,
}: {
  userId:       string;
  initialItems: NotificationSummaryRow[];
}) {
  const router               = useRouter();
  const [expanded, setExpanded] = useState(false);

  const { data: items = initialItems, mutate } = useSWR(
    keyFor.notifications(userId),
    () => fetchNotificationSummary(),
    { fallbackData: initialItems, revalidateOnMount: false },
  );

  function handleTap(postId: string) {
    // Optimistically drop the tapped row so the count/row vanish with
    // no flicker. On dismiss failure, focus revalidation restores it.
    mutate(
      (current) => (current ?? []).filter((r) => r.post_id !== postId),
      { revalidate: false },
    );
    fetch("/api/notifications/dismiss", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ post_id: postId }),
    }).catch(() => {});
    router.push(`/lounge/${postId}`, { scroll: false });
  }

  // No new activity — hide the section entirely (matches Aging Shelf).
  if (items.length === 0) return null;

  const count = items.length;

  return (
    <section
      className="animate-fade-in"
      style={{
        animationDelay: "140ms",
        position:       "relative",
        border:         "1px solid var(--card-border)",
        borderRadius:   6,
        background:     "var(--card-bg)",
        boxShadow:      "var(--card-edge)",
        padding:        "18px 20px 16px",
        overflow:       "hidden",
      }}
      aria-label="Notifications"
    >
      {/* Radial highlight in top-right */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          top:           0,
          right:         0,
          width:         140,
          height:        140,
          background:    "radial-gradient(ellipse at top right, rgba(212,160,74,0.16), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Eyebrow with trailing rule */}
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
          marginBottom:  10,
          position:      "relative",
          zIndex:        1,
        }}
      >
        Notifications
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      {/* Header row — italic title + view/hide toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-baseline justify-between"
        style={{
          minHeight:               44,
          padding:                 "0",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          background:              "none",
          border:                  "none",
          cursor:                  "pointer",
          textAlign:               "left",
          position:                "relative",
          zIndex:                  1,
        } as React.CSSProperties}
        aria-expanded={expanded}
        aria-controls="notifications-list"
      >
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontWeight: 500,
            fontSize:   "clamp(20px, 5vw, 24px)",
            lineHeight: 1.1,
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          {count === 1 ? "1 thread has new activity." : `${count} threads have new activity.`}
        </h2>

        <span
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           6,
            fontFamily:    "var(--font-mono)",
            fontSize:      9,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--paper-mute)",
            flexShrink:    0,
          }}
        >
          {expanded ? "Hide" : "View"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{
              transition: "transform 0.25s ease",
              transform:  expanded ? "rotate(0deg)" : "rotate(-90deg)",
              color:      "var(--gold)",
            }}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* Expandable list */}
      <div
        id="notifications-list"
        style={{
          maxHeight:  expanded ? 1400 : 0,
          opacity:    expanded ? 1 : 0,
          overflow:   "hidden",
          transition: "max-height 320ms ease, opacity 220ms ease, margin-top 200ms ease, padding-top 200ms ease",
          borderTop:  expanded ? "1px solid var(--line)" : "1px solid transparent",
          marginTop:  expanded ? 12 : 0,
          paddingTop: expanded ? 4 : 0,
          position:   "relative",
          zIndex:     1,
        }}
      >
        <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {items.map((row) => (
            <NotificationRow key={row.post_id} row={row} onTap={handleTap} />
          ))}
        </div>
      </div>
    </section>
  );
}
