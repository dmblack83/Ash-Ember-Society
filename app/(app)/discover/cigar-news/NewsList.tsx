"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import type { NewsItem } from "@/lib/data/news";
import { loadMoreNews } from "./actions";

const PAGE_SIZE = 20;
const MAX_ITEMS = 100;

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:         "block",
        backgroundColor: "var(--card)",
        border:          "1px solid rgba(255,255,255,0.06)",
        borderRadius:    16,
        overflow:        "hidden",
        textDecoration:  "none",
      }}
    >
      {item.image_url && (
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/10", backgroundColor: "var(--secondary)" }}>
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            style={{ objectFit: "cover" }}
            unoptimized
          />
        </div>
      )}
      <div style={{ padding: "16px 18px" }}>
        <h3
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   18,
            fontWeight: 600,
            color:      "var(--gold, #D4A04A)",
            lineHeight: 1.3,
            margin:     "0 0 8px",
          }}
        >
          {item.title}
        </h3>
        {item.summary && (
          <p
            style={{
              fontSize:    13.5,
              lineHeight:  1.5,
              color:       "var(--foreground)",
              opacity:     0.85,
              margin:      "0 0 10px",
              display:     "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow:    "hidden",
            } as React.CSSProperties}
          >
            {item.summary}
          </p>
        )}
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
          {item.source_name} &middot; {relativeTime(item.published_at)}
        </p>
      </div>
    </a>
  );
}

export function NewsList({ initial }: { initial: NewsItem[] }) {
  const [items,   setItems]   = useState<NewsItem[]>(initial);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!hasMore || pending) return;
    const offset = items.length;
    startTransition(async () => {
      const next = await loadMoreNews(offset, PAGE_SIZE);
      const merged = [...items, ...next];
      setItems(merged);
      setHasMore(next.length >= PAGE_SIZE && merged.length < MAX_ITEMS);
    });
  }

  if (items.length === 0) {
    return (
      <p
        style={{
          fontSize:   14,
          color:      "var(--muted-foreground)",
          textAlign:  "center",
          padding:    "40px 20px",
          fontFamily: "var(--font-serif)",
        }}
      >
        No articles yet. Check back soon.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((item) => <NewsCard key={item.id} item={item} />)}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          style={{
            marginTop:               4,
            height:                  44,
            borderRadius:            999,
            border:                  "1px solid var(--border)",
            background:              pending ? "rgba(212,160,74,0.08)" : "rgba(212,160,74,0.10)",
            color:                   "var(--gold, #D4A04A)",
            fontWeight:              600,
            fontSize:                14,
            cursor:                  pending ? "default" : "pointer",
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
