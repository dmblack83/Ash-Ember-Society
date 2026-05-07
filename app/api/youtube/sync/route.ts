import { NextRequest, NextResponse }   from "next/server";
import { createServiceClient }          from "@/utils/supabase/service";
import { startCronRun, finishCronRun }  from "@/lib/cron-log";

// Node.js runtime — consistency with the news sync route, and avoids
// the quiet failures we saw with Edge + service-client work.
export const runtime = "nodejs";

/* ------------------------------------------------------------------
   ISO 8601 duration parser  e.g. "PT1H2M3S" -> 3723 seconds
   ------------------------------------------------------------------ */

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    (parseInt(m[1] ?? "0", 10) * 3600) +
    (parseInt(m[2] ?? "0", 10) * 60)  +
     parseInt(m[3] ?? "0", 10)
  );
}

/* ------------------------------------------------------------------
   YouTube Data API helpers
   ------------------------------------------------------------------ */

const YT = "https://www.googleapis.com/youtube/v3";

async function ytFetch(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY env var not set");
  const qs  = new URLSearchParams({ ...params, key }).toString();
  const res = await fetch(`${YT}/${path}?${qs}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${path} ${res.status}: ${body}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------
   Sync one channel
   ------------------------------------------------------------------ */

async function syncChannel(
  supabase: ReturnType<typeof createServiceClient>,
  channelRow: {
    id:                  string;
    youtube_channel_id:  string;
    uploads_playlist_id: string;
  }
) {
  // 1. Fetch latest 5 video IDs from uploads playlist
  const plData = await ytFetch("playlistItems", {
    part:       "snippet",
    playlistId: channelRow.uploads_playlist_id,
    maxResults: "5",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = plData.items ?? [];
  if (items.length === 0) return 0;

  const ytIds = items
    .map((i) => i.snippet?.resourceId?.videoId as string)
    .filter(Boolean);

  // 2. Fetch video details (stats + contentDetails for duration)
  const vData = await ytFetch("videos", {
    part: "snippet,statistics,contentDetails",
    id:   ytIds.join(","),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vMap: Record<string, any> = {};
  for (const v of vData.items ?? []) {
    vMap[v.id] = v;
  }

  // 3. Retire currently active videos for this channel
  await supabase
    .from("content_videos")
    .update({ is_active: false, position: null })
    .eq("channel_id", channelRow.id)
    .eq("is_active", true);

  // 4. Upsert the 5 fetched videos as active
  // Order by publishedAt desc -> position 1 is newest
  const sorted = [...ytIds].sort((a, b) => {
    const da = vMap[a]?.snippet?.publishedAt ?? "";
    const db = vMap[b]?.snippet?.publishedAt ?? "";
    return db.localeCompare(da);
  });

  for (let i = 0; i < sorted.length; i++) {
    const ytId = sorted[i];
    const v    = vMap[ytId];
    if (!v) continue;

    const thumb =
      v.snippet?.thumbnails?.maxres?.url ??
      v.snippet?.thumbnails?.high?.url   ??
      v.snippet?.thumbnails?.default?.url ?? null;

    await supabase.from("content_videos").upsert(
      {
        channel_id:       channelRow.id,
        youtube_video_id: ytId,
        title:            v.snippet?.title ?? "(untitled)",
        description:      v.snippet?.description?.slice(0, 1000) ?? null,
        thumbnail_url:    thumb,
        published_at:     v.snippet?.publishedAt ?? null,
        view_count:       parseInt(v.statistics?.viewCount ?? "0", 10),
        duration_seconds: parseDuration(v.contentDetails?.duration ?? "PT0S"),
        is_active:        true,
        position:         i + 1,
      },
      { onConflict: "youtube_video_id" }
    );
  }

  // 5. Refresh channel stats
  const chData = await ytFetch("channels", {
    part: "statistics",
    id:   channelRow.youtube_channel_id,
  });
  const stats = chData.items?.[0]?.statistics;
  if (stats) {
    await supabase
      .from("content_channels")
      .update({
        subscriber_count: parseInt(stats.subscriberCount ?? "0", 10),
        last_synced_at:   new Date().toISOString(),
      })
      .eq("id", channelRow.id);
  }

  return sorted.length;
}

/* ------------------------------------------------------------------
   Route handler — GET or POST
   ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

/* ------------------------------------------------------------------
   Auth — matches the news sync route's pattern.

   Production accepts:
     - Authorization: Bearer ${CRON_SECRET}     (Vercel cron when set)
     - x-sync-secret: ${SYNC_SECRET}            (manual / staging)

   Development additionally accepts:
     - user-agent: vercel-cron/...              (fallback when CRON_SECRET
                                                 isn't set yet — convenience
                                                 only; UA is spoofable)
   ------------------------------------------------------------------ */

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  // Dev-only UA fallback. Never honor in production — UA is trivially
  // spoofable and would allow any caller to trigger YouTube sync runs.
  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }

  return false;
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    console.warn("[youtube-sync] unauthorized", {
      hasAuthHeader: !!req.headers.get("authorization"),
      hasSyncSecret: !!req.headers.get("x-sync-secret"),
      userAgent:     req.headers.get("user-agent"),
      cronSecretSet: !!process.env.CRON_SECRET,
      syncSecretSet: !!process.env.SYNC_SECRET,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await startCronRun("youtube-sync", "0 */3 * * *");
  try {
  const supabase = createServiceClient();
  const url      = new URL(req.url);
  const handle   = url.searchParams.get("handle");

  let channelRows: { id: string; youtube_channel_id: string; uploads_playlist_id: string }[] = [];

  if (handle) {
    // Seed mode: look up channel by handle then upsert
    const data = await ytFetch("channels", {
      part:      "snippet,contentDetails,statistics",
      forHandle: handle,
    });

    const ch = data.items?.[0];
    if (!ch) {
      await finishCronRun(run, { ok: false, error: `No YouTube channel found for handle: ${handle}` });
      return NextResponse.json({ error: `No YouTube channel found for handle: ${handle}` }, { status: 404 });
    }

    const thumb =
      ch.snippet?.thumbnails?.high?.url    ??
      ch.snippet?.thumbnails?.default?.url ?? null;

    const { data: row, error } = await supabase
      .from("content_channels")
      .upsert(
        {
          youtube_channel_id:  ch.id,
          handle:              `@${handle}`,
          name:                ch.snippet?.title,
          description:         ch.snippet?.description?.slice(0, 500) ?? null,
          thumbnail_url:       thumb,
          subscriber_count:    parseInt(ch.statistics?.subscriberCount ?? "0", 10),
          uploads_playlist_id: ch.contentDetails?.relatedPlaylists?.uploads,
          custom_url:          ch.snippet?.customUrl ?? null,
          last_synced_at:      new Date().toISOString(),
        },
        { onConflict: "youtube_channel_id" }
      )
      .select("id, youtube_channel_id, uploads_playlist_id")
      .single();

    if (error || !row) {
      await finishCronRun(run, { ok: false, error: `Failed to upsert channel: ${error?.message ?? "no row"}`.slice(0, 500) });
      return NextResponse.json({ error: "Failed to upsert channel", details: error }, { status: 500 });
    }

    channelRows = [row];
  } else {
    // Sync all active channels
    const { data, error } = await supabase
      .from("content_channels")
      .select("id, youtube_channel_id, uploads_playlist_id")
      .eq("is_active", true);

    if (error) {
      await finishCronRun(run, { ok: false, error: `Failed to load channels: ${error.message}`.slice(0, 500) });
      return NextResponse.json({ error: "Failed to load channels", details: error }, { status: 500 });
    }
    channelRows = data ?? [];
  }

  let totalVideos = 0;
  for (const ch of channelRows) {
    try {
      totalVideos += await syncChannel(supabase, ch);
    } catch (err) {
      console.error(`Sync failed for channel ${ch.id}:`, err);
    }
  }

  console.log("[youtube-sync] complete", { channels: channelRows.length, videos: totalVideos });

  await finishCronRun(run, { ok: true, summary: { channels: channelRows.length, videos: totalVideos } });
  return NextResponse.json({ synced: channelRows.length, videos: totalVideos });
  } catch (err) {
    await finishCronRun(run, { ok: false, error: (err as Error).message?.slice(0, 500) ?? "unknown error" });
    throw err;
  }
}
