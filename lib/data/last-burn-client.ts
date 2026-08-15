"use client";

/*
 * Fetcher for the home-page Last Burn island. Two queries in parallel:
 * the single latest smoke log, and any logs matching today's
 * month+day in past years (On This Day). Flavor names + video resolve
 * after, only when needed. Pairs with keyFor.lastBurn(userId).
 */

import { createClient } from "@/utils/supabase/client";
import { fetchFlavorTags } from "@/lib/data/flavor-tags-client";
import { onThisDayCandidates } from "@/lib/home/last-burn";
import { todayLocalYmd } from "@/lib/format";

export interface LastBurnLog {
  id: string;
  smoked_at: string;              // normalized to YYYY-MM-DD (see toLog)
  overall_rating: number | null;
  draw_rating: number | null;
  burn_rating: number | null;
  construction_rating: number | null;
  smoke_duration_minutes: number | null;
  pairing_drink: string | null;
  review_text: string | null;
  humidor_item_id: string | null;
  isFullReport: boolean;
  flavorNames: string[];          // first 3, resolved
  video: { youtube_video_id: string } | null;
  cigar: { brand: string | null; series: string | null; format: string | null };
}
export interface LastBurnBundle {
  latest: LastBurnLog | null;
  onThisDay: LastBurnLog | null;  // oldest past-year match for today, else null
  readyCount: number;             // in-stock items whose aging target has arrived, unwindowed
}

const SELECT = `
  id, smoked_at, created_at, overall_rating, draw_rating, burn_rating,
  construction_rating, smoke_duration_minutes, pairing_drink, review_text,
  flavor_tag_ids, content_video_id, humidor_item_id,
  cigar:cigar_catalog(brand, series, format),
  burn_report:burn_reports(id)
`;

/* Raw row → LastBurnLog (flavor/video resolution happens in fetchLastBurn). */
type Raw = {
  id: string; smoked_at: string; created_at: string;
  overall_rating: number | null; draw_rating: number | null;
  burn_rating: number | null; construction_rating: number | null;
  smoke_duration_minutes: number | null; pairing_drink: string | null;
  review_text: string | null; flavor_tag_ids: string[] | null;
  content_video_id: string | null; humidor_item_id: string | null;
  cigar: { brand: string | null; series: string | null; format: string | null }
       | Array<{ brand: string | null; series: string | null; format: string | null }> | null;
  burn_report: { id: string } | Array<{ id: string }> | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchLastBurn(userId: string): Promise<LastBurnBundle> {
  const supabase = createClient();
  const [latestRes, otdRes, readyRes] = await Promise.all([
    supabase.from("smoke_logs").select(SELECT)
      .eq("user_id", userId)
      .order("smoked_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("smoke_logs").select(SELECT)
      .eq("user_id", userId)
      .in("smoked_at", onThisDayCandidates())
      .order("smoked_at", { ascending: true })
      .limit(1),
    supabase.from("humidor_items").select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_wishlist", false)
      .gt("quantity", 0)
      .lte("aging_target_date", todayLocalYmd()),
  ]);
  if (latestRes.error) throw new Error(latestRes.error.message);
  if (otdRes.error) throw new Error(otdRes.error.message);
  if (readyRes.error) throw new Error(readyRes.error.message);

  const rows = [
    (latestRes.data ?? [])[0] as Raw | undefined,
    (otdRes.data ?? [])[0] as Raw | undefined,
  ];

  /* Resolve flavor names once if either row needs them. */
  const needsTags = rows.some((r) => (r?.flavor_tag_ids?.length ?? 0) > 0);
  const tagNames: Record<string, string> = {};
  if (needsTags) {
    for (const t of await fetchFlavorTags()) tagNames[t.id] = t.name;
  }

  /* Resolve videos (0-2 lookups collapse into one .in()). */
  const videoIds = rows.map((r) => r?.content_video_id).filter((v): v is string => !!v);
  const videoMap = new Map<string, { youtube_video_id: string }>();
  if (videoIds.length > 0) {
    const { data: videos } = await supabase
      .from("content_videos").select("id, youtube_video_id").in("id", videoIds);
    for (const v of videos ?? []) videoMap.set(v.id, { youtube_video_id: v.youtube_video_id });
  }

  const toLog = (r: Raw | undefined): LastBurnLog | null => {
    if (!r) return null;
    return {
      /* smoked_at is timestamptz storing midnight-UTC date-only values;
         PostgREST returns the full ISO string, the lib/home/last-burn
         helpers expect plain YYYY-MM-DD, so slice at the boundary. */
      id: r.id, smoked_at: r.smoked_at.slice(0, 10),
      overall_rating: r.overall_rating, draw_rating: r.draw_rating,
      burn_rating: r.burn_rating, construction_rating: r.construction_rating,
      smoke_duration_minutes: r.smoke_duration_minutes,
      pairing_drink: r.pairing_drink, review_text: r.review_text,
      humidor_item_id: r.humidor_item_id,
      isFullReport: one(r.burn_report) != null,
      flavorNames: (r.flavor_tag_ids ?? []).slice(0, 3)
        .map((id) => tagNames[id]).filter((n): n is string => !!n),
      video: r.content_video_id ? (videoMap.get(r.content_video_id) ?? null) : null,
      cigar: one(r.cigar) ?? { brand: null, series: null, format: null },
    };
  };

  return { latest: toLog(rows[0]), onThisDay: toLog(rows[1]), readyCount: readyRes.count ?? 0 };
}
