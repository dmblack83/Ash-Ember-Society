"use client";

/*
 * Client-side fetcher for the My Burn Reports list. Ports the exact
 * server assembly the page ran before the static-shell conversion:
 * smoke_logs (with cigar + burn_report joins) + flavor tags + profile
 * lite in parallel, then the batched per-third tag-name resolution.
 *
 * Pairs with keyFor.burnReports(userId).
 */

import { createClient } from "@/utils/supabase/client";
import { fetchFlavorTags } from "@/lib/data/flavor-tags-client";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { getBurnReportThirdsTaggedBatch } from "@/lib/data/burn-report-thirds-batch";
import type { BurnReportRow, FlavorTag } from "@/components/humidor/BurnReportsClient";

export interface BurnReportsBundle {
  reports:     BurnReportRow[];
  flavorTags:  FlavorTag[];
  displayName: string | null;
  city:        string | null;
}

export async function fetchBurnReportsBundle(userId: string): Promise<BurnReportsBundle> {
  const supabase = createClient();

  const [logsRes, flavorTagsAll, profile] = await Promise.all([
    supabase
      .from("smoke_logs")
      .select(`
        id,
        smoked_at,
        overall_rating,
        draw_rating,
        burn_rating,
        construction_rating,
        flavor_rating,
        smoke_duration_minutes,
        pairing_drink,
        location,
        occasion,
        flavor_tag_ids,
        photo_urls,
        review_text,
        content_video_id,
        cigar:cigar_catalog(id, brand, series, format, wrapper, image_url),
        burn_report:burn_reports(id, thirds_enabled, third_beginning, third_middle, third_end)
      `)
      .eq("user_id", userId)
      .order("smoked_at", { ascending: false })
      .limit(50),
    fetchFlavorTags(),
    fetchProfileLite(userId),
  ]);

  if (logsRes.error) throw new Error(logsRes.error.message);

  const reports    = (logsRes.data ?? []) as unknown as BurnReportRow[];
  const flavorTags = flavorTagsAll.map((t) => ({ id: t.id, name: t.name })) as FlavorTag[];

  /* Resolve per-third tag NAMES for thirds-enabled reports so the
     My Reports modal renders <VerdictCard /> with the same
     `thirdsTaggedRows` shape the in-flight Summary uses. */
  const burnReportIds: string[] = [];
  for (const r of reports) {
    const br = Array.isArray(r.burn_report) ? r.burn_report[0] : r.burn_report;
    const id = (br as { id?: string } | null)?.id;
    if (id && br?.thirds_enabled) burnReportIds.push(id);
  }
  const tagNameMap: Record<string, string> =
    Object.fromEntries(flavorTagsAll.map((t) => [t.id, t.name]));
  const taggedByReportId = await getBurnReportThirdsTaggedBatch(
    supabase, burnReportIds, tagNameMap,
  );

  const reportsWithThirds: BurnReportRow[] = reports.map((r) => {
    const brArr = Array.isArray(r.burn_report) ? r.burn_report : (r.burn_report ? [r.burn_report] : null);
    if (!brArr || brArr.length === 0) return r;
    const br = brArr[0] as { id?: string };
    const rows = br.id ? taggedByReportId[br.id] : undefined;
    if (!rows) return r;
    return {
      ...r,
      burn_report: brArr.map((b) => ({ ...b, thirds_tagged_rows: rows })),
    };
  });

  return {
    reports:     reportsWithThirds,
    flavorTags,
    displayName: profile?.display_name ?? null,
    city:        profile?.city ?? null,
  };
}
