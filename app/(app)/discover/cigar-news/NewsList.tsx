"use client";

import useSWRInfinite from "swr/infinite";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import type { NewsItem } from "@/lib/data/news";
import { keyFor } from "@/lib/data/keys";
import { fetchNewsPage } from "@/lib/data/news-client";

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

function NewsCardSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        backgroundColor: "var(--card)",
        border:          "1px solid rgba(255,255,255,0.06)",
        borderRadius:    16,
        overflow:        "hidden",
      }}
    >
      <div style={{ width: "100%", aspectRatio: "16/10", backgroundColor: "var(--secondary)" }} />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="h-5 bg-muted rounded" style={{ width: "80%" }} />
        <div className="h-3 bg-muted rounded" style={{ width: "60%" }} />
        <div className="h-3 bg-muted rounded" style={{ width: "35%" }} />
      </div>
    </div>
  );
}

export function NewsList() {
  /*
   * useSWRInfinite replaces the old useState + server-action pattern:
   * pages cache under keyFor.newsPage, so navigating away and back
   * renders instantly (including previously loaded pages) instead of
   * refetching from scratch and resetting to page one.
   */
  const { data, size, setSize, isLoading, isValidating } =
    useSWRInfinite<NewsItem[]>(
      (pageIndex, prev) => {
        if (prev && prev.length < PAGE_SIZE) return null;   /* last page reached */
        if (pageIndex * PAGE_SIZE >= MAX_ITEMS) return null; /* hard cap */
        return keyFor.newsPage(pageIndex);
      },
      ([, pageIndex]) => fetchNewsPage((pageIndex as number) * PAGE_SIZE, PAGE_SIZE),
    );

  const items = (data ?? []).flat();
  const lastPage = data?.[data.length - 1];
  const hasMore =
    !!lastPage && lastPage.length >= PAGE_SIZE && items.length < MAX_ITEMS;
  const pending = isValidating && size > (data?.length ?? 0);

  function loadMore() {
    if (!hasMore || pending) return;
    void setSize(size + 1);
  }

  if (isLoading && items.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <NewsCardSkeleton />
        <NewsCardSkeleton />
      </div>
    );
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
