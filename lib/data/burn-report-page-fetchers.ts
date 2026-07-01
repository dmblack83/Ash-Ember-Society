"use client";

/*
 * Client-side fetchers for the burn-report create and edit pages.
 * Both port the exact server assembly their pages ran before the
 * static-shell conversion. Null return = not found / not owned; the
 * routes map that to notFound().
 *
 * Pair with keyFor.burnReportCreate / keyFor.burnReportEdit.
 */

import { createClient } from "@/utils/supabase/client";
import { fetchFlavorTags } from "@/lib/data/flavor-tags-client";
import { fetchProfileLite } from "@/lib/data/profile-client";
import type {
  BurnReportItem,
  FlavorTag,
  PartnerVideo,
} from "@/app/(app)/humidor/[id]/burn-report/page";
import type { BurnReportExisting } from "@/components/humidor/BurnReport";
import type { PerThirdData } from "@/lib/burn-report/thirds";

/* ── Create page bundle ─────────────────────────────────────────── */

export interface BurnReportCreateBundle {
  item:             BurnReportItem;
  flavorTags:       FlavorTag[];
  displayName:      string | null;
  city:             string | null;
  badge:            string | null;
  nextReportNumber: number;
  partnerVideos:    PartnerVideo[];
}

export async function fetchBurnReportCreateBundle(
  userId: string,
  itemId: string,
): Promise<BurnReportCreateBundle | null> {
  const supabase = createClient();

  const [{ data: item, error }, profile, flavorTagData, { count: priorReportCount }] =
    await Promise.all([
      supabase
        .from("humidor_items")
        .select("id, cigar_id, quantity, cigar:cigar_catalog(id, brand, series, format, image_url, wrapper)")
        .eq("id", itemId)
        .eq("user_id", userId)
        .maybeSingle(),
      fetchProfileLite(userId),
      fetchFlavorTags(),
      /* Next sequential burn-report number ("NO. 12" on the Verdict
         Card masthead). Only depends on userId, so it runs with the
         batch instead of as a second round-trip. */
      supabase
        .from("smoke_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

  if (error) throw new Error(error.message);
  if (!item || !item.cigar_id) return null;

  /* Partner videos only if the user has the Partner badge. */
  let partnerVideos: PartnerVideo[] = [];
  if (profile?.badge === "partner") {
    const { data: channel } = await supabase
      .from("content_channels")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (channel) {
      const { data: videos } = await supabase
        .from("content_videos")
        .select("id, youtube_video_id, title, thumbnail_url, position")
        .eq("channel_id", channel.id)
        .eq("is_active", true)
        .order("position", { ascending: true });
      partnerVideos = (videos ?? []) as PartnerVideo[];
    }
  }

  return {
    item:             item as unknown as BurnReportItem,
    flavorTags:       flavorTagData as FlavorTag[],
    displayName:      profile?.display_name ?? null,
    city:             profile?.city ?? null,
    badge:            profile?.badge ?? null,
    nextReportNumber: (priorReportCount ?? 0) + 1,
    partnerVideos,
  };
}

/* ── Edit page bundle ───────────────────────────────────────────── */

interface BurnReportThirdRowClient {
  third_index:         number;
  notes:               string;
  draw_rating:         number;
  burn_rating:         number;
  construction_rating: number;
  flavor_rating:       number;
  flavor_tag_ids:      string[];
}

function rowsToFormThirds(
  rows: BurnReportThirdRowClient[],
): [PerThirdData | null, PerThirdData | null, PerThirdData | null] {
  const out: (PerThirdData | null)[] = [null, null, null];
  for (const row of rows) {
    if (row.third_index < 1 || row.third_index > 3) continue;
    out[row.third_index - 1] = {
      notes:               row.notes,
      draw_rating:         row.draw_rating,
      burn_rating:         row.burn_rating,
      construction_rating: row.construction_rating,
      flavor_rating:       row.flavor_rating,
      flavor_tag_ids:      row.flavor_tag_ids,
    };
  }
  return [out[0], out[1], out[2]];
}

export interface BurnReportEditBundle {
  existing:     BurnReportExisting;
  item:         BurnReportItem;
  flavorTags:   FlavorTag[];
  displayName:  string | null;
  city:         string | null;
  reportNumber: number;
}

export async function fetchBurnReportEditBundle(
  userId:     string,
  smokeLogId: string,
): Promise<BurnReportEditBundle | null> {
  const supabase = createClient();

  /* Report + cigar + burn_reports child in one round-trip; ownership
     enforced by eq(user_id) (and RLS). */
  const { data: report, error: reportError } = await supabase
    .from("smoke_logs")
    .select(`
      id,
      cigar_id,
      humidor_item_id,
      smoked_at,
      overall_rating,
      location,
      occasion,
      pairing_drink,
      pairing_food,
      draw_rating,
      burn_rating,
      construction_rating,
      flavor_rating,
      flavor_tag_ids,
      photo_urls,
      review_text,
      smoke_duration_minutes,
      content_video_id,
      cigar:cigar_catalog(id, brand, series, format, image_url, wrapper),
      burn_report:burn_reports(id, thirds_enabled, third_beginning, third_middle, third_end)
    `)
    .eq("id",      smokeLogId)
    .eq("user_id", userId)
    .maybeSingle();

  if (reportError) throw new Error(reportError.message);
  if (!report || !report.cigar) return null;

  const cigar = Array.isArray(report.cigar) ? report.cigar[0] : report.cigar;
  if (!cigar) return null;

  const thirdsRaw    = report.burn_report;
  const thirds       = Array.isArray(thirdsRaw) ? thirdsRaw[0] : thirdsRaw;
  const burnReportId = thirds?.id ?? null;

  const [profile, flavorTagData, thirdsRows, { count: olderOrEqual }] =
    await Promise.all([
      fetchProfileLite(userId),
      fetchFlavorTags(),
      burnReportId
        ? supabase
            .from("burn_report_thirds")
            .select(`
              third_index,
              notes,
              draw_rating,
              burn_rating,
              construction_rating,
              flavor_rating,
              burn_report_third_flavor_tags ( flavor_tag_id )
            `)
            .eq("burn_report_id", burnReportId)
            .order("third_index", { ascending: true })
            .then(({ data }) =>
              (data ?? []).map((row) => ({
                ...row,
                flavor_tag_ids: (row.burn_report_third_flavor_tags ?? []).map(
                  (j: { flavor_tag_id: string }) => j.flavor_tag_id,
                ),
              })) as BurnReportThirdRowClient[],
            )
        : Promise.resolve([] as BurnReportThirdRowClient[]),
      /* Display number = chronological position, same as the list. */
      supabase
        .from("smoke_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("smoked_at", report.smoked_at as string),
    ]);

  const item: BurnReportItem = {
    id:        report.humidor_item_id ?? smokeLogId,
    cigar_id:  report.cigar_id,
    quantity:  0,
    cigar: {
      id:        cigar.id,
      brand:     cigar.brand,
      series:    cigar.series,
      format:    cigar.format,
      image_url: cigar.image_url,
      wrapper:   cigar.wrapper,
    },
  };

  /* HTML5 <input type="date"> needs "YYYY-MM-DD"; Postgres returns a
     full ISO timestamp. Slice so the field paints on edit-mode mount. */
  const smokedAtForInput = report.smoked_at
    ? String(report.smoked_at).slice(0, 10)
    : "";

  const existing: BurnReportExisting = {
    smoke_log_id:           report.id,
    smoked_at:              smokedAtForInput,
    overall_rating:         report.overall_rating ?? 75,
    location:               report.location ?? "",
    occasion:               report.occasion ?? "",
    pairing_drink:          report.pairing_drink ?? "",
    pairing_food:           report.pairing_food ?? "",
    draw_rating:            report.draw_rating ?? 0,
    burn_rating:            report.burn_rating ?? 0,
    construction_rating:    report.construction_rating ?? 0,
    flavor_rating:          report.flavor_rating ?? 0,
    flavor_tag_ids:         report.flavor_tag_ids ?? [],
    review_text:            report.review_text ?? "",
    smoke_duration_minutes: report.smoke_duration_minutes != null
      ? String(report.smoke_duration_minutes)
      : "",
    content_video_id:       report.content_video_id ?? null,
    photo_urls:             report.photo_urls ?? [],
    thirds_enabled:         thirds?.thirds_enabled ?? false,
    third_beginning:        thirds?.third_beginning ?? "",
    third_middle:           thirds?.third_middle    ?? "",
    third_end:              thirds?.third_end       ?? "",
    thirds:                 rowsToFormThirds(thirdsRows),
  };

  return {
    existing,
    item,
    flavorTags:   flavorTagData as FlavorTag[],
    displayName:  profile?.display_name ?? null,
    city:         profile?.city ?? null,
    reportNumber: olderOrEqual ?? 1,
  };
}
