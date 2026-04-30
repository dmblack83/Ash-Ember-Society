import { createClient }  from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { notFound, redirect } from "next/navigation";
import { HumidorItemClient } from "@/components/humidor/HumidorItemClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
   Types (shared with client via props)
   ------------------------------------------------------------------ */

export interface CigarDetail {
  id: string;
  brand: string | null;
  series: string | null;
  format: string | null;
  wrapper: string | null;
  wrapper_country: string | null;
  binder_country: string | null;
  filler_countries: string[] | null;
  ring_gauge: number | null;
  length_inches: number | null;
  image_url: string | null;
}

export interface HumidorItemDetail {
  id: string;
  cigar_id: string;
  quantity: number;
  purchase_date: string | null;
  price_paid_cents: number | null;
  source: string | null;
  aging_start_date:  string | null;
  aging_target_date: string | null;
  notes: string | null;
  created_at: string;
  cigar: CigarDetail;
}

export interface SmokeLog {
  id: string;
  smoked_at: string;
  overall_rating: number | null;
  review_text: string | null;
  content_video_id: string | null;
  content_video: { youtube_video_id: string; title: string } | null;
}

/* ------------------------------------------------------------------
   Page — server component
   ------------------------------------------------------------------ */

export default async function HumidorItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) redirect("/login");

  // Step 1: fetch the item (ownership-checked). Need cigar_id before the
  // next batch can run.
  const { data: item, error } = await supabase
    .from("humidor_items")
    .select("*, cigar:cigar_catalog(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) notFound();

  // Step 2: image-submission status and the user's smoke logs for this
  // cigar are independent — fetch in parallel.
  const [{ data: submission }, { data: smokeLogs }] = await Promise.all([
    supabase
      .from("cigar_image_submissions")
      .select("status")
      .eq("cigar_id", item.cigar_id)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("smoke_logs")
      .select("id, smoked_at, overall_rating, review_text, content_video_id")
      .eq("user_id", user.id)
      .eq("cigar_id", item.cigar_id)
      .order("smoked_at", { ascending: false }),
  ]);

  // Fetch video data for any logs that have a linked video
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

  return (
    <HumidorItemClient
      item={item as HumidorItemDetail}
      initialSmokeLogs={normalizedLogs}
      hasPending={submission?.status === "pending"}
      hasApproved={submission?.status === "approved"}
    />
  );
}
