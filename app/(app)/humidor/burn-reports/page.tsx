import { createClient }       from "@/utils/supabase/server";
import { getServerUser }      from "@/lib/auth/server-user";
import { getProfileLite }     from "@/lib/data/profile";
import { getFlavorTags }      from "@/lib/data/flavor-tags";
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
        burn_report:burn_reports(thirds_enabled, third_beginning, third_middle, third_end)
      `)
      .eq("user_id", user.id)
      .order("smoked_at", { ascending: false }),
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

  return (
    <BurnReportsClient
      reports={reports}
      flavorTags={flavorTags}
      displayName={profile?.display_name ?? null}
      city={profile?.city ?? null}
    />
  );
}
