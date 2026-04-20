import { createClient }       from "@/utils/supabase/server";
import { BurnReportsClient }  from "@/components/humidor/BurnReportsClient";
import type { BurnReportRow } from "@/components/humidor/BurnReportsClient";

export const dynamic = "force-dynamic";

export default async function BurnReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
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
      review_text,
      cigar:cigar_catalog(id, brand, name, series, format, wrapper, image_url)
    `)
    .eq("user_id", user.id)
    .order("smoked_at", { ascending: false });

  const reports = (data ?? []) as unknown as BurnReportRow[];

  return <BurnReportsClient reports={reports} />;
}
