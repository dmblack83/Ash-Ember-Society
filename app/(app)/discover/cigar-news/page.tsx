import { NewsList } from "./NewsList";
import { PullToRefresh } from "@/components/ui/PullToRefresh";

export const metadata = { title: "Industry News — Ash & Ember Society" };

/*
 * Industry News — static shell. The first page of news used to be
 * fetched server-side (edge runtime, dynamic render on every
 * navigation); NewsList now owns all pagination via useSWRInfinite,
 * so the document prerenders and revisits render every previously
 * loaded page instantly from the SWR cache.
 */
export default function NewsIndexPage() {
  return (
    <PullToRefresh>
    <div className="max-w-2xl mx-auto" style={{ padding: "24px 16px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   34,
            fontWeight: 700,
            color:      "var(--foreground)",
            margin:     0,
            lineHeight: 1.05,
          }}
        >
          Industry{" "}
          <em
            style={{
              fontStyle:  "italic",
              fontWeight: 700,
              color:      "var(--gold, #D4A04A)",
            }}
          >
            News
          </em>
        </h1>
        <p
          style={{
            fontFamily:    "Inter, system-ui, sans-serif",
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         "var(--muted-foreground)",
            marginTop:     6,
          }}
        >
          From Around The World
        </p>
      </div>

      <NewsList />
    </div>
    </PullToRefresh>
  );
}
