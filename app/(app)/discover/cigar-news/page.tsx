import { getNewsPage }  from "@/lib/data/news";
import { NewsList }     from "./NewsList";

export const runtime  = "edge";
export const metadata = { title: "Industry News — Ash & Ember Society" };

export default async function NewsIndexPage() {
  const initial = await getNewsPage(0, 20);

  return (
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

      <NewsList initial={initial} />
    </div>
  );
}
