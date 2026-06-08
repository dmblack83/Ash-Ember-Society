/* ------------------------------------------------------------------
   GET /api/burn-report/[id]/share-image?page=1|2

   Renders a burn report as a 1080px-wide PNG for social sharing.
   Page 2 returns HTTP 204 when the report has no content for it.

   Sharp requires Node.js — do NOT set runtime = "edge" here.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse }     from "next/server";
import satori                            from "satori";
import sharp                             from "sharp";
import { getServerUser }                 from "@/lib/auth/server-user";
import { createServiceClientFor }        from "@/utils/supabase/service";
import { getFlavorTags }                 from "@/lib/data/flavor-tags";
import { getBurnReportThirdsTaggedBatch } from "@/lib/data/burn-report-thirds";
import { computeReportNumbers }          from "@/lib/data/burn-report-number";
import { loadFonts }                     from "@/lib/share-image/fonts";
import type { Font }                     from "satori";
import { buildPage1 }                    from "@/lib/share-image/page1";
import { buildPage2 }                    from "@/lib/share-image/page2";
import { shouldRenderPage2 }             from "@/lib/share-image/helpers";
import type { ShareImageProps }          from "@/lib/share-image/types";
import { T }                             from "@/lib/share-image/tokens";

async function toDataUri(url: string): Promise<string> {
  const res  = await fetch(url);
  const buf  = await res.arrayBuffer();
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Auth
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Validate page param
  const page = req.nextUrl.searchParams.get("page");
  if (page !== "1" && page !== "2") {
    return NextResponse.json({ error: "page must be 1 or 2" }, { status: 400 });
  }

  // 3. Fetch report (service role — ownership enforced by user_id filter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientFor(user.id, "share-image-generation") as any;

  const { data: log, error: logErr } = await supabase
    .from("smoke_logs")
    .select(`
      id, user_id, smoked_at,
      overall_rating, draw_rating, burn_rating, construction_rating, flavor_rating,
      smoke_duration_minutes, pairing_drink, occasion,
      flavor_tag_ids, photo_urls, review_text,
      cigar:cigar_catalog(brand, series, format),
      burn_report:burn_reports(id, thirds_enabled, third_beginning, third_middle, third_end)
    `)
    .eq("id",      id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (logErr || !log) {
    return NextResponse.json({ error: "Burn report not found" }, { status: 404 });
  }

  // 4. Resolve thirds tagged rows
  const brRaw = Array.isArray(log.burn_report) ? log.burn_report[0] : log.burn_report;
  const br    = brRaw as {
    id?: string; thirds_enabled?: boolean;
    third_beginning?: string | null; third_middle?: string | null; third_end?: string | null;
  } | null;

  const allFlavorTags = await getFlavorTags();
  const tagNameMap    = Object.fromEntries(allFlavorTags.map((t) => [t.id, t.name]));

  const burnReportId = br?.id ?? null;
  const thirdsTaggedMap = burnReportId && br?.thirds_enabled
    ? await getBurnReportThirdsTaggedBatch(supabase, [burnReportId], tagNameMap)
    : {};
  const thirdsTaggedRows = burnReportId ? (thirdsTaggedMap[burnReportId] ?? []) : [];

  // 5. Report number
  const numberMap    = await computeReportNumbers(supabase, [id]);
  const reportNumber = numberMap[id] ?? null;

  // 6. Global flavor tag names
  const tagIds         = (log.flavor_tag_ids ?? []) as string[];
  const flavorTagNames = tagIds.map((tid) => tagNameMap[tid]).filter(Boolean) as string[];

  // 7. Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, city")
    .eq("id", user.id)
    .maybeSingle();

  // 8. Prefetch photos as data URIs
  const photoUrls    = ((log.photo_urls ?? []) as string[]).filter(Boolean).slice(0, 3);
  const photoDataUris = await Promise.all(photoUrls.map(toDataUri));

  // 9. Build props
  const cigarRaw = Array.isArray(log.cigar) ? log.cigar[0] : log.cigar;
  const props: ShareImageProps = {
    reportNumber,
    smokedAt:             log.smoked_at as string,
    cigar:                cigarRaw ?? null,
    overallRating:        (log.overall_rating as number | null),
    drawRating:           (log.draw_rating as number | null),
    burnRating:           (log.burn_rating as number | null),
    constructionRating:   (log.construction_rating as number | null),
    flavorRating:         (log.flavor_rating as number | null),
    reviewText:           (log.review_text as string | null),
    smokeDurationMinutes: (log.smoke_duration_minutes as number | null),
    pairingDrink:         (log.pairing_drink as string | null),
    occasion:             (log.occasion as string | null),
    flavorTagNames,
    photoDataUris,
    thirdsEnabled:        br?.thirds_enabled ?? false,
    thirdBeginning:       br?.third_beginning ?? null,
    thirdMiddle:          br?.third_middle ?? null,
    thirdEnd:             br?.third_end ?? null,
    thirdsTaggedRows,
    displayName:          (profile?.display_name as string | null) ?? null,
    city:                 (profile?.city as string | null) ?? null,
  };

  // 10. Guard: page 2 with no content
  if (page === "2" && !shouldRenderPage2(props)) {
    return new NextResponse(null, { status: 204 });
  }

  // 11. Render SVG via Satori
  const element = page === "1" ? buildPage1(props) : buildPage2(props);
  const svg     = await satori(element, {
    width:  T.IMAGE_WIDTH,
    height: T.IMAGE_MAX_HEIGHT,
    fonts:  loadFonts() as Font[],
  });

  // 12. Convert SVG → PNG, trim blank bottom created by the max-height canvas
  const pngBuf = await sharp(Buffer.from(svg))
    .trim({ background: T.background, threshold: 10 })
    .png()
    .toBuffer();

  return new NextResponse(new Uint8Array(pngBuf), {
    headers: {
      "Content-Type":  "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}
