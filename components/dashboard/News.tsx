import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { NewsItem } from "@/lib/data/news";

/* ------------------------------------------------------------------
   News
   ------------------------------------------------------------------
   Server component. Renders the "From The World" card on the home
   dashboard: a card with eyebrow + title + a 5-row list of latest
   articles + "View More" link to /discover/partners.
   Each row links out to the source article in a new tab. No in-app
   reading sheet — that's the whole point of the RSS rebuild.
   ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: false })
      // strip "about ", "less than ", "almost " etc.
      .replace(/^about\s+/, "")
      .replace(/^less than\s+/, "<")
      .replace(/^almost\s+/, "")
      .replace(/^over\s+/, "")
      // shorten units: "hours" -> "h", "minutes" -> "m", etc.
      .replace(/\s*hours?$/, "h")
      .replace(/\s*minutes?$/, "m")
      .replace(/\s*days?$/, "d")
      .replace(/\s*months?$/, "mo")
      .replace(/\s*years?$/, "y") + " ago";
  } catch {
    return "";
  }
}

export function News({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <section
        className="rounded-2xl"
        style={{
          backgroundColor: "var(--card)",
          border:          "1px solid rgba(255,255,255,0.06)",
          padding:         "20px 22px",
        }}
      >
        <p
          style={{
            fontFamily:    "Inter, system-ui, sans-serif",
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         "var(--muted-foreground)",
            marginBottom:  6,
          }}
        >
          From The World
        </p>
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   28,
            fontWeight: 700,
            color:      "var(--gold, #D4A04A)",
            margin:     "0 0 16px",
            lineHeight: 1,
          }}
        >
          News
        </h2>
        <p
          style={{
            fontSize:   13,
            color:      "var(--muted-foreground)",
            lineHeight: 1.5,
          }}
        >
          No articles yet. Check back soon.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl"
      style={{
        backgroundColor: "var(--card)",
        border:          "1px solid rgba(255,255,255,0.06)",
        padding:         "20px 22px",
      }}
    >
      {/* Eyebrow */}
      <p
        style={{
          fontFamily:    "Inter, system-ui, sans-serif",
          fontSize:      11,
          fontWeight:    600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         "var(--muted-foreground)",
          marginBottom:  6,
        }}
      >
        From The World
      </p>

      {/* Title */}
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize:   28,
          fontWeight: 700,
          color:      "var(--gold, #D4A04A)",
          margin:     "0 0 18px",
          lineHeight: 1,
        }}
      >
        News
      </h2>

      {/* Item list */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 18 }}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:        "block",
                textDecoration: "none",
              }}
            >
              <h3
                style={{
                  fontFamily:    "var(--font-serif)",
                  fontSize:      17,
                  fontWeight:    600,
                  color:         "var(--gold, #D4A04A)",
                  lineHeight:    1.3,
                  margin:        "0 0 4px",
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  fontSize:   12,
                  color:      "var(--muted-foreground)",
                  margin:     0,
                }}
              >
                {item.source_name} &middot; {relativeTime(item.published_at)}
              </p>
            </a>
          </li>
        ))}
      </ul>

      {/* View More */}
      <Link
        href="/discover/partners"
        prefetch={false}
        className="block w-full rounded-full text-center"
        style={{
          marginTop:               20,
          padding:                 "12px 16px",
          background:              "linear-gradient(135deg, #D4A04A, #C17817)",
          color:                   "#1A1210",
          fontWeight:              600,
          fontSize:                14,
          textDecoration:          "none",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        View More
      </Link>
    </section>
  );
}
