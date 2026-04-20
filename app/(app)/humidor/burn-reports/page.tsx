import { createClient }        from "@/utils/supabase/server";
import { BurnReportsClient }   from "@/components/humidor/BurnReportsClient";
import type { BurnReportRow }  from "@/components/humidor/BurnReportsClient";

// User-specific data -- opt out of static rendering
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
      review_text,
      cigar:cigar_catalog(id, brand, name, format)
    `)
    .eq("user_id", user.id)
    .order("smoked_at", { ascending: false });

  const reports = (data ?? []) as unknown as BurnReportRow[];

  return <BurnReportsClient reports={reports} />;
}
