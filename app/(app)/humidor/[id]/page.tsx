import { ItemRoute } from "./ItemRoute";

/*
 * Humidor item detail — client shell (same pattern as /humidor). The
 * ownership-checked item read, status reads, and video lookups that
 * used to run here server-side now run client-side in
 * lib/data/humidor-item-fetchers.ts (RLS + explicit eq enforce
 * ownership). The route stays dynamic (path param) but the document
 * carries no data, so tapping an item paints the skeleton instantly.
 */

/* ------------------------------------------------------------------
   Types (imported by HumidorItemClient and the client fetcher —
   type-only exports, erased at runtime)
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
  shade: string | null;
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

export default async function HumidorItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ItemRoute itemId={id} />;
}
