import { createClient }       from "@/utils/supabase/server";
import { getServerUser }      from "@/lib/auth/server-user";
import { BurnReportsClient }  from "@/components/humidor/BurnReportsClient";
import type { BurnReportRow, FlavorTag } from "@/components/humidor/BurnReportsClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function BurnReportsPage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  if (!user) return null;

  const [logsRes, tagsRes, profileRes] = await Promise.all([
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
    supabase.from("flavor_tags").select("id, name"),
    supabase
      .from("profiles")
      .select("display_name, city")
      .eq("id", user.id)
      .single(),
  ]);

  const reports    = (logsRes.data ?? []) as unknown as BurnReportRow[];
  const flavorTags = (tagsRes.data ?? []) as FlavorTag[];

  return (
    <BurnReportsClient
      reports={reports}
      flavorTags={flavorTags}
      displayName={profileRes.data?.display_name ?? null}
      city={profileRes.data?.city ?? null}
    />
  );
}
