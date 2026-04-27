import { unstable_cache }       from "next/cache";
import { createClient }          from "@/utils/supabase/server";
import { createServiceClient }   from "@/utils/supabase/service";
import { redirect }              from "next/navigation";
import { getMembershipTier }     from "@/lib/membership";
import { ChannelsClient }        from "@/components/discover/ChannelsClient";

export const metadata = { title: "Partner Channels — Ash & Ember Society" };

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface ChannelVideo {
  id:               string;
  youtube_video_id: string;
  title:            string;
  thumbnail_url:    string | null;
  published_at:     string | null;
  view_count:       number;
  duration_seconds: number | null;
  position:         number;
  like_count:       number;
  comment_count:    number;
  user_has_liked:   boolean;
}

export interface Channel {
  id:               string;
  name:             string;
  handle:           string;
  description:      string | null;
  thumbnail_url:    string | null;
  subscriber_count: number | null;
  last_synced_at:   string | null;
  videos:           ChannelVideo[];
}

/* ------------------------------------------------------------------
   Cached data loader — channels, videos, aggregate counts
   Revalidates every 5 minutes. Uses service role to bypass RLS.
   User-specific likes are fetched fresh per request below.
   ------------------------------------------------------------------ */

const getCachedChannelData = unstable_cache(
  async () => {
    const supabase = createServiceClient();

    const { data: channelData } = await supabase
      .from("content_channels")
      .select("id, name, handle, description, thumbnail_url, subscriber_count, last_synced_at")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (!channelData || channelData.length === 0) {
      return { channelData: [] as typeof channelData, videoData: [], likeCountMap: {} as Record<string, number>, commentCountMap: {} as Record<string, number> };
    }

    const channelIds = channelData.map((c) => c.id);

    const { data: rawVideos } = await supabase
      .from("content_videos")
      .select("id, channel_id, youtube_video_id, title, thumbnail_url, published_at, view_count, duration_seconds, position")
      .in("channel_id", channelIds)
      .eq("is_active", true)
      .order("position", { ascending: true });

    const videoData = rawVideos ?? [];
    const videoIds  = videoData.map((v) => v.id);

    const [{ data: likesData }, { data: commentsData }] = await Promise.all([
      videoIds.length
        ? supabase.from("content_video_likes").select("video_id").in("video_id", videoIds)
        : Promise.resolve({ data: [] }),
      videoIds.length
        ? supabase.from("content_video_comments").select("video_id").in("video_id", videoIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likeCountMap: Record<string, number> = {};
    for (const l of likesData ?? []) {
      likeCountMap[l.video_id] = (likeCountMap[l.video_id] ?? 0) + 1;
    }

    const commentCountMap: Record<string, number> = {};
    for (const c of commentsData ?? []) {
      commentCountMap[c.video_id] = (commentCountMap[c.video_id] ?? 0) + 1;
    }

    return { channelData, videoData, likeCountMap, commentCountMap };
  },
  ["channel-data"],
  { revalidate: 300 }, // 5 minutes
);

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default async function ChannelsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Run auth-gated queries + cached data in parallel
  const [{ data: profileData }, { channelData, videoData, likeCountMap, commentCountMap }] =
    await Promise.all([
      supabase.from("profiles").select("membership_tier").eq("id", user.id).single(),
      getCachedChannelData(),
    ]);

  const tier     = getMembershipTier(profileData);
  const videoIds = videoData.map((v) => v.id);

  // User's own likes — always fresh
  const { data: userLikesData } = videoIds.length
    ? await supabase
        .from("content_video_likes")
        .select("video_id")
        .eq("user_id", user.id)
        .in("video_id", videoIds)
    : { data: [] };

  const userLikeSet = new Set((userLikesData ?? []).map((l) => l.video_id));

  // Group videos by channel
  const videosByChannel: Record<string, ChannelVideo[]> = {};
  for (const v of videoData) {
    if (!videosByChannel[v.channel_id]) videosByChannel[v.channel_id] = [];
    videosByChannel[v.channel_id].push({
      id:               v.id,
      youtube_video_id: v.youtube_video_id,
      title:            v.title,
      thumbnail_url:    v.thumbnail_url,
      published_at:     v.published_at,
      view_count:       v.view_count ?? 0,
      duration_seconds: v.duration_seconds,
      position:         v.position,
      like_count:       likeCountMap[v.id] ?? 0,
      comment_count:    commentCountMap[v.id] ?? 0,
      user_has_liked:   userLikeSet.has(v.id),
    });
  }

  const channels: Channel[] = (channelData ?? []).map((ch) => ({
    ...ch,
    videos: videosByChannel[ch.id] ?? [],
  }));

  // Fire-and-forget background sync for stale channels (> 1 hr since last sync)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const needsSync  = (channelData ?? []).some((ch) => {
    if (!ch.last_synced_at) return true;
    return new Date(ch.last_synced_at).getTime() < oneHourAgo;
  });

  if (needsSync) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    fetch(`${siteUrl}/api/youtube/sync`, {
      method:  "POST",
      headers: { "x-sync-secret": process.env.SYNC_SECRET ?? "" },
    }).catch(() => {});
  }

  return (
    <ChannelsClient
      channels={channels}
      userId={user.id}
      tier={tier}
    />
  );
}
