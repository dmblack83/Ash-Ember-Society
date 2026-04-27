import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import { HumidorItemClient } from "@/components/humidor/HumidorItemClient";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: item, error } = await supabase
    .from("humidor_items")
    .select("*, cigar:cigar_catalog(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) notFound();

  const { data: smokeLogs } = await supabase
    .from("smoke_logs")
    .select("id, smoked_at, overall_rating, review_text, content_video_id, content_video:content_videos!content_video_id(youtube_video_id, title)")
    .eq("user_id", user.id)
    .eq("cigar_id", item.cigar_id)
    .order("smoked_at", { ascending: false });

  // Normalize: Supabase returns joined rows as arrays; flatten content_video to object|null
  const normalizedLogs: SmokeLog[] = (smokeLogs ?? []).map((log) => {
    const raw = log as unknown as {
      id: string;
      smoked_at: string;
      overall_rating: number | null;
      review_text: string | null;
      content_video_id: string | null;
      content_video: { youtube_video_id: string; title: string }[] | null;
    };
    return {
      ...raw,
      content_video: Array.isArray(raw.content_video) ? (raw.content_video[0] ?? null) : raw.content_video,
    };
  });

  return (
    <HumidorItemClient
      item={item as HumidorItemDetail}
      initialSmokeLogs={normalizedLogs}
    />
  );
}
