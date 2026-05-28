"use client";

import { useState }   from "react";
import { useRouter }  from "next/navigation";
import useSWR         from "swr";
import { keyFor }     from "@/lib/data/keys";
import { fetchNotificationSummary } from "@/lib/data/notifications";
import type { NotificationSummaryRow } from "@/lib/data/notifications";

/* ------------------------------------------------------------------
   Row copy — singular/plural aware. No em dashes (user-facing).

   Unread (unseen_count > 0): the NEW count, e.g. "3 new comments".
   Read  (unseen_count = 0):  lifetime activity, e.g. "12 comments".
   ------------------------------------------------------------------ */
function rowCopy(row: NotificationSummaryRow): string {
  const unread = Number(row.unseen_count) > 0;

  if (unread) {
    const n = Number(row.unseen_count);
    return row.kind === "participated"
      ? `${n} new repl${n === 1 ? "y" : "ies"} to you`
      : `${n} new comment${n === 1 ? "" : "s"}`;
  }

  const n = Number(row.total_count);
  return row.kind === "participated"
    ? `${n} repl${n === 1 ? "y" : "ies"}`
    : `${n} comment${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------
   Single notification row (expanded only). Tapping marks it read
   (ember dot clears) and navigates — the row itself is retained.

   Unread rows show an ember dot on the left and a stronger count line;
   read rows drop the dot and mute the count. A fixed-width dot slot
   keeps titles aligned across both states.
   ------------------------------------------------------------------ */
function NotificationRow({
  row,
  onTap,
}: {
  row:   NotificationSummaryRow;
  onTap: (postId: string) => void;
}) {
  const unread = Number(row.unseen_count) > 0;

  return (
    <button
      type="button"
      onClick={() => onTap(row.post_id)}
      className="w-full flex items-center gap-3 text-left transition-opacity active:opacity-70"
      style={{
        minHeight:               44,
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        background:              "none",
        border:                  "none",
        padding:                 "10px 0",
        cursor:                  "pointer",
      } as React.CSSProperties}
      aria-label={`${row.title}: ${rowCopy(row)}${unread ? " (unread)" : ""}`}
    >
      {/* Unread indicator slot — fixed width so read/unread rows align */}
      <span
        aria-hidden="true"
        style={{
          flexShrink:   0,
          width:        8,
          height:       8,
          borderRadius: "50%",
          background:   unread ? "var(--ember)" : "transparent",
        }}
      />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {row.title}
        </p>
        <p
          className="text-sm truncate leading-snug"
          style={{
            fontWeight: unread ? 600 : 500,
            color:      unread ? "var(--foreground)" : "var(--paper-mute)",
          }}
        >
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

   Client-fetched via SWR (the RPC scopes by auth.uid(), which only
   resolves for the browser client — see NotificationsIsland). Fetches
   on mount and revalidates on focus; optimistic mutate marks a row
   read on tap. Chrome matches the Aging Shelf; collapsed by default.
   ------------------------------------------------------------------ */
export function Notifications({ userId }: { userId: string }) {
  const router               = useRouter();
  const [expanded, setExpanded] = useState(false);

  const { data, mutate } = useSWR(
    keyFor.notifications(userId),
    () => fetchNotificationSummary(),
  );

  function handleTap(postId: string) {
    // Optimistically mark the tapped row read (unseen_count -> 0): the
    // ember dot clears and the unread tally drops, but the row stays in
    // the list. The dismiss POST persists last_seen_at = now(); on
    // failure, focus revalidation restores the unread state.
    mutate(
      (current) =>
        (current ?? []).map((r) =>
          r.post_id === postId ? { ...r, unseen_count: 0 } : r,
        ),
      { revalidate: false },
    );
    fetch("/api/notifications/dismiss", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ post_id: postId }),
    }).catch(() => {});
    router.push(`/lounge/${postId}`, { scroll: false });
  }

  // Brief initial load before the first client fetch resolves. The
  // home page's Suspense skeleton covers the gap; render nothing rather
  // than flash an empty state.
  if (data === undefined) return null;

  const items       = data;
  const hasRows     = items.length > 0;
  const unreadCount = items.filter((r) => Number(r.unseen_count) > 0).length;

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

      {/* No active threads — quiet default. Same wording as the all-read
          headline so the two states read identically. */}
      {!hasRows && (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontWeight: 500,
            fontSize:   "clamp(18px, 4.5vw, 22px)",
            lineHeight: 1.2,
            color:      "var(--paper-mute)",
            margin:     0,
            position:   "relative",
            zIndex:     1,
          }}
        >
          No new activity.
        </p>
      )}

      {/* Header row — italic title + view/hide toggle */}
      {hasRows && (
      <>
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
          {unreadCount === 0
            ? "No new activity."
            : unreadCount === 1
              ? "1 thread has new activity."
              : `${unreadCount} threads have new activity.`}
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
      </>
      )}
    </section>
  );
}
