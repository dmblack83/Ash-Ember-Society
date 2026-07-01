"use client";

/*
 * Client-side fetcher for the Humidor item detail page. Ports the
 * exact server assembly the page ran before the static-shell
 * conversion: ownership-checked item read, then the independent
 * submission/edit-suggestion/smoke-log reads in parallel, then video
 * lookups for logs with linked videos.
 *
 * Pairs with keyFor.humidorItemBundle(userId, itemId). Returns null
 * when the item doesn't exist or isn't owned by this user (RLS +
 * explicit eq both apply) — the route maps null to notFound().
 */

import { createClient } from "@/utils/supabase/client";
import type { HumidorItemDetail, SmokeLog } from "@/app/(app)/humidor/[id]/page";

export interface HumidorItemBundle {
  item:           HumidorItemDetail;
  smokeLogs:      SmokeLog[];
  hasPending:     boolean;
  hasApproved:    boolean;
  hasPendingEdit: boolean;
}

export async function fetchHumidorItemBundle(
  userId: string,
  itemId: string,
): Promise<HumidorItemBundle | null> {
  const supabase = createClient();

  /* Step 1: the item (ownership-checked). cigar_id is needed before
     the dependent batch can run. */
  const { data: item, error } = await supabase
    .from("humidor_items")
    .select("*, cigar:cigar_catalog(*)")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!item) return null;

  /* Step 2: independent reads in parallel. RLS on
     cigar_edit_suggestions scopes the read to this user automatically. */
  const [{ data: submission }, { data: editSuggestion }, { data: smokeLogs }] =
    await Promise.all([
      supabase
        .from("cigar_image_submissions")
        .select("status")
        .eq("cigar_id", item.cigar_id)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cigar_edit_suggestions")
        .select("status")
        .eq("cigar_id", item.cigar_id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("smoke_logs")
        .select("id, smoked_at, overall_rating, review_text, content_video_id")
        .eq("user_id", userId)
        .eq("cigar_id", item.cigar_id)
        .order("smoked_at", { ascending: false }),
    ]);

  /* Video data for any logs with a linked video. */
  const videoIds = (smokeLogs ?? [])
    .map((l) => l.content_video_id)
    .filter((v): v is string => v != null);

  const videoMap = new Map<string, { youtube_video_id: string; title: string }>();
  if (videoIds.length > 0) {
    const { data: videos } = await supabase
      .from("content_videos")
      .select("id, youtube_video_id, title")
      .in("id", videoIds);
    for (const v of videos ?? []) {
      videoMap.set(v.id, { youtube_video_id: v.youtube_video_id, title: v.title });
    }
  }

  const normalizedLogs: SmokeLog[] = (smokeLogs ?? []).map((log) => ({
    ...log,
    content_video: log.content_video_id ? (videoMap.get(log.content_video_id) ?? null) : null,
  }));

  return {
    item:           item as HumidorItemDetail,
    smokeLogs:      normalizedLogs,
    hasPending:     submission?.status === "pending",
    hasApproved:    submission?.status === "approved",
    hasPendingEdit: editSuggestion !== null,
  };
}
