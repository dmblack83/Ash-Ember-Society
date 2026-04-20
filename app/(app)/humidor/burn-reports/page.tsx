import { createClient }       from "@/utils/supabase/server";
import { BurnReportsClient }  from "@/components/humidor/BurnReportsClient";
import type { BurnReportRow, FlavorTag } from "@/components/humidor/BurnReportsClient";

export const dynamic = "force-dynamic";

export default async function BurnReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [logsRes, tagsRes] = await Promise.all([
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
        cigar:cigar_catalog(id, brand, name, series, format, wrapper, image_url)
      `)
      .eq("user_id", user.id)
      .order("smoked_at", { ascending: false }),
    supabase.from("flavor_tags").select("id, name"),
  ]);

  const reports    = (logsRes.data ?? []) as unknown as BurnReportRow[];
  const flavorTags = (tagsRes.data ?? []) as FlavorTag[];

  return <BurnReportsClient reports={reports} flavorTags={flavorTags} />;
}
