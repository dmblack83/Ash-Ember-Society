import { IntentLink } from "@/components/ui/IntentLink";
import { formatDistanceToNow } from "date-fns";
import type { NewsItem } from "@/lib/data/news";

/* ------------------------------------------------------------------
   News — "The Wire" column

   Server component. Renders the editorial newswire on the home
   dashboard: italic-serif column header with leading rule, a stack
   of source/headline/meta rows, and a quiet "View More →" CTA.
   No thumbnails — text-only per the design.
   ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: false })
      .replace(/^about\s+/, "")
      .replace(/^less than\s+/, "<")
      .replace(/^almost\s+/, "")
      .replace(/^over\s+/, "")
      .replace(/\s*hours?$/, "h")
      .replace(/\s*minutes?$/, "m")
      .replace(/\s*days?$/, "d")
      .replace(/\s*months?$/, "mo")
      .replace(/\s*years?$/, "y") + " ago";
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------
   Column header — "The *Wire*" with leading gold rule
   ------------------------------------------------------------------ */

function WireHeader() {
  return (
    <div
      style={{
        display:      "flex",
        alignItems:   "baseline",
        gap:          12,
        marginBottom: 14,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width:      18,
          height:     1,
          background: "var(--gold)",
          alignSelf:  "center",
        }}
      />
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize:   22,
          lineHeight: 1.1,
          color:      "var(--foreground)",
          margin:     0,
        }}
      >
        The{" "}
        <em style={{ fontStyle: "italic", color: "var(--gold)" }}>Wire</em>
      </h2>
    </div>
  );
}

export function News({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <section aria-label="The Wire">
        <WireHeader />
        <p
          style={{
            fontSize:   13,
            color:      "var(--paper-mute)",
            lineHeight: 1.5,
            margin:     0,
          }}
        >
          No articles yet. Check back soon.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="The Wire">
      <WireHeader />

      {/* Item list */}
      <ul
        style={{
          listStyle:     "none",
          padding:       0,
          margin:        0,
          borderTop:     "1px solid var(--line)",
        }}
      >
        {items.map((item) => (
          <li
            key={item.id}
            style={{ borderBottom: "1px solid var(--line-soft)" }}
          >
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:                 "block",
                padding:                 "14px 0",
                textDecoration:          "none",
                touchAction:             "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {/* Source eyebrow */}
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--gold)",
                  margin:        "0 0 6px",
                }}
              >
                {item.source_name}
              </p>

              {/* Headline */}
              <h3
                style={{
                  fontFamily:    "var(--font-serif)",
                  fontSize:      16,
                  fontWeight:    500,
                  color:         "var(--foreground)",
                  lineHeight:    1.35,
                  margin:        "0 0 6px",
                  letterSpacing: "-0.005em",
                }}
              >
                {item.title}
              </h3>

              {/* Meta row */}
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color:         "var(--paper-dim)",
                  margin:        0,
                }}
              >
                {relativeTime(item.published_at)}
              </p>
            </a>
          </li>
        ))}
      </ul>

      {/* View More */}
      <IntentLink
        href="/discover/cigar-news"
        style={{
          display:                 "inline-flex",
          alignItems:              "center",
          gap:                     8,
          marginTop:               14,
          fontFamily:              "var(--font-mono)",
          fontSize:                10,
          fontWeight:              600,
          letterSpacing:           "0.22em",
          textTransform:           "uppercase",
          color:                   "var(--gold)",
          textDecoration:          "none",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        View More
        <span aria-hidden="true">→</span>
      </IntentLink>
    </section>
  );
}
