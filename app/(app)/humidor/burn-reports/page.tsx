import { createClient }       from "@/utils/supabase/server";
import { getServerUser }      from "@/lib/auth/server-user";
import { getProfileLite }     from "@/lib/data/profile";
import { getFlavorTags }      from "@/lib/data/flavor-tags";
import { getBurnReportThirdsTaggedBatch } from "@/lib/data/burn-report-thirds";
import { BurnReportsClient }  from "@/components/humidor/BurnReportsClient";
import type { BurnReportRow, FlavorTag } from "@/components/humidor/BurnReportsClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function BurnReportsPage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  if (!user) return null;

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
      .eq("user_id", user.id)
      .order("smoked_at", { ascending: false })
      .limit(50),
    /* Cached cross-request — see lib/data/flavor-tags.ts. The full
       category column is in the cached payload but BurnReportsClient
       only uses { id, name }, so we narrow at the boundary. */
    getFlavorTags(),
    /* React.cache()-deduped — see lib/data/profile.ts. Other server
       components on the same page render get the same cached row. */
    getProfileLite(user.id),
  ]);

  const reports    = (logsRes.data ?? []) as unknown as BurnReportRow[];
  const flavorTags = flavorTagsAll.map((t) => ({ id: t.id, name: t.name })) as FlavorTag[];

  /* Resolve per-third tag NAMES for any thirds-enabled reports, so
     the My Reports modal renders <VerdictCard /> with the same
     `thirdsTaggedRows` shape the in-flight Summary uses. The single
     batched query reads burn_report_thirds + the per-third flavor
     join keyed off each report's burn_reports.id. */
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

  /* Attach per-row so the client component can read it without
     another lookup. The BurnReportThirds type already declares
     thirds_tagged_rows? optional, so this is a no-op for non-thirds
     reports. */
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

  return (
    <BurnReportsClient
      reports={reportsWithThirds}
      flavorTags={flavorTags}
      displayName={profile?.display_name ?? null}
      city={profile?.city ?? null}
    />
  );
}
