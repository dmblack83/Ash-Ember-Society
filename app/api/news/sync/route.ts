import { NextRequest, NextResponse }   from "next/server";
import { revalidateTag }                from "next/cache";
import { XMLParser }                    from "fast-xml-parser";
import { createServiceClient }          from "@/utils/supabase/service";
import { NEWS_FEEDS, type NewsFeed }    from "@/lib/news-feeds";
import { startCronRun, finishCronRun }  from "@/lib/cron-log";

// Node.js runtime — Edge runtime had quiet issues with revalidateTag()
// in this codebase, leaving stale data in the home page cache after
// each sync run. Node is also the safer default for the Supabase
// service client + XML parser used here.
export const runtime = "nodejs";

/**
 * POST/GET /api/news/sync
 *
 * Fetches every feed in NEWS_FEEDS, parses RSS 2.0, and upserts items
 * into news_items keyed by guid. Triggered hourly by Vercel Cron.
 *
 * Auth (any of the following):
 *   - Authorization: Bearer <CRON_SECRET>  (Vercel cron sends this)
 *   - x-sync-secret: <SYNC_SECRET>          (manual invocation; matches
 *                                            the existing youtube/sync
 *                                            pattern)
 */

interface RssItem {
  title?:       string | { "#text": string };
  link?:        string;
  guid?:        string | { "#text": string; "@_isPermaLink"?: string };
  pubDate?:     string;
  description?: string;
  "content:encoded"?: string;
  "media:content"?: { "@_url"?: string } | { "@_url"?: string }[];
  enclosure?:   { "@_url"?: string; "@_type"?: string };
}

interface RssChannel {
  item?: RssItem | RssItem[];
}

interface RssRoot {
  rss?: { channel?: RssChannel };
}

interface NewsRow {
  guid:         string;
  source_name:  string;
  source_slug:  string;
  title:        string;
  link:         string;
  summary:      string | null;
  image_url:    string | null;
  published_at: string;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function unwrap(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "#text" in v) {
    const t = (v as { "#text": unknown })["#text"];
    return typeof t === "string" ? t : String(t ?? "");
  }
  return String(v);
}

/**
 * Strip HTML tags and collapse whitespace.
 * Used to turn the description HTML blob into plain-text summary.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the first <img src="..."> out of a description / content blob.
 * Falls back to media:content / enclosure URLs the parser surfaced
 * separately.
 */
function extractImage(item: RssItem): string | null {
  for (const blob of [item.description, item["content:encoded"]]) {
    if (!blob) continue;
    const m = blob.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  }

  const media = item["media:content"];
  if (Array.isArray(media)) {
    const first = media.find((x) => x?.["@_url"]);
    if (first?.["@_url"]) return first["@_url"];
  } else if (media?.["@_url"]) {
    return media["@_url"];
  }

  if (item.enclosure?.["@_type"]?.startsWith("image/") && item.enclosure["@_url"]) {
    return item.enclosure["@_url"];
  }

  return null;
}

const parser = new XMLParser({
  ignoreAttributes:  false,
  attributeNamePrefix: "@_",
  textNodeName:      "#text",
  trimValues:        true,
});

/* ------------------------------------------------------------------
   Per-feed fetch + parse
   ------------------------------------------------------------------ */

async function fetchFeed(feed: NewsFeed): Promise<NewsRow[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "AshEmberBot/1.0 (+https://ashember.vip)" },
    // Edge runtime supports `next: { revalidate }` but we want fresh
    // every cron run — disable Next caching for this fetch.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${feed.url}: HTTP ${res.status}`);

  const xml    = await res.text();
  const parsed = parser.parse(xml) as RssRoot;
  const ch     = parsed.rss?.channel;
  if (!ch) return [];

  const items = Array.isArray(ch.item) ? ch.item : ch.item ? [ch.item] : [];
  const rows: NewsRow[] = [];

  for (const it of items) {
    const title = unwrap(it.title).trim();
    const link  = (unwrap(it.link) || "").trim();
    if (!title || !link) continue;

    const guidRaw = unwrap(it.guid).trim() || link;
    // Namespace the guid by source so two feeds can't collide.
    const guid    = `${feed.slug}:${guidRaw}`;

    const pubRaw = unwrap(it.pubDate).trim();
    const pubMs  = pubRaw ? Date.parse(pubRaw) : NaN;
    if (Number.isNaN(pubMs)) continue;

    const summaryHtml = it.description ?? it["content:encoded"] ?? "";
    const summary     = summaryHtml ? stripHtml(summaryHtml).slice(0, 400) : null;
    const image_url   = extractImage(it);

    rows.push({
      guid,
      source_name:  feed.name,
      source_slug:  feed.slug,
      title,
      link,
      summary,
      image_url,
      published_at: new Date(pubMs).toISOString(),
    });
  }
  return rows;
}

/* ------------------------------------------------------------------
   Auth
   ------------------------------------------------------------------ */

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  // Vercel Cron sets Authorization: Bearer <CRON_SECRET> automatically.
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  // Manual / staging trigger uses the same x-sync-secret pattern as
  // /api/youtube/sync.
  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  // Dev-only UA fallback: production REQUIRES CRON_SECRET (or SYNC_SECRET
  // for manual triggers) above. The vercel-cron/* user-agent is trivially
  // spoofable, so honoring it in production would let any caller trigger
  // arbitrary RSS sync runs. Kept as a convenience for local dev where
  // CRON_SECRET may not be set yet.
  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }

  return false;
}

/* ------------------------------------------------------------------
   Handler
   ------------------------------------------------------------------ */

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    console.warn("[news-sync] unauthorized", {
      hasAuthHeader:    !!req.headers.get("authorization"),
      hasSyncSecret:    !!req.headers.get("x-sync-secret"),
      userAgent:        req.headers.get("user-agent"),
      cronSecretSet:    !!process.env.CRON_SECRET,
      syncSecretSet:    !!process.env.SYNC_SECRET,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await startCronRun("news-sync", "0 */3 * * *");
  try {
  const supabase = createServiceClient();

  const perFeed: { slug: string; fetched: number; upserted: number; error?: string }[] = [];
  let totalUpserted = 0;

  for (const feed of NEWS_FEEDS) {
    try {
      const rows = await fetchFeed(feed);
      if (rows.length === 0) {
        perFeed.push({ slug: feed.slug, fetched: 0, upserted: 0 });
        continue;
      }

      const { error, count } = await supabase
        .from("news_items")
        .upsert(rows, { onConflict: "guid", count: "exact", ignoreDuplicates: false });

      if (error) {
        perFeed.push({ slug: feed.slug, fetched: rows.length, upserted: 0, error: error.message });
      } else {
        perFeed.push({ slug: feed.slug, fetched: rows.length, upserted: count ?? rows.length });
        totalUpserted += count ?? rows.length;
      }
    } catch (e) {
      perFeed.push({
        slug:     feed.slug,
        fetched:  0,
        upserted: 0,
        error:    e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Expire the cached news reads immediately so the home + Discover
  // surfaces pick up the new items on the very next visit. The "max"
  // profile we used to call here is stale-while-revalidate, which left
  // visitors seeing the old news for one more page load after each
  // cron run; { expire: 0 } is the recommended pattern for webhook /
  // cron triggers per the Next.js docs.
  if (totalUpserted > 0) revalidateTag("news-items", { expire: 0 });

  console.log("[news-sync] complete", { totalUpserted, perFeed });

  await finishCronRun(run, { ok: true, summary: { totalUpserted, perFeed } });
  return NextResponse.json({ ok: true, totalUpserted, perFeed });
  } catch (err) {
    await finishCronRun(run, { ok: false, error: (err as Error).message?.slice(0, 500) ?? "unknown error" });
    throw err;
  }
}

export const GET  = handle;
export const POST = handle;
