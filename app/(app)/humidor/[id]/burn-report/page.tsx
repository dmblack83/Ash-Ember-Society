import { BurnReportCreateRoute } from "./BurnReportCreateRoute";

/*
 * Burn-report create — client shell (same pattern as /humidor). The
 * item + profile + flavor-tags + report-number assembly that used to
 * run here server-side now runs client-side in
 * lib/data/burn-report-page-fetchers.ts. The route stays dynamic
 * (path param) but the document carries no data, so entering the
 * wizard paints the skeleton instantly.
 */

/* ------------------------------------------------------------------
   Shared types (imported by BurnReport + client fetchers —
   type-only exports, erased at runtime)
   ------------------------------------------------------------------ */

export interface BurnReportCigar {
  id: string;
  brand: string | null;
  series: string | null;
  format: string | null;
  image_url: string | null;
  wrapper: string | null;
}

export interface BurnReportItem {
  id: string;
  cigar_id: string;
  quantity: number;
  cigar: BurnReportCigar;
}

export interface FlavorTag {
  id: string;
  name: string;
  category: string;
}

export interface PartnerVideo {
  id: string;
  youtube_video_id: string;
  title: string;
  thumbnail_url: string | null;
  position: number;
}

export default async function BurnReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BurnReportCreateRoute itemId={id} />;
}
