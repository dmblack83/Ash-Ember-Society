import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import { BurnReport } from "@/components/humidor/BurnReport";

/* ------------------------------------------------------------------
   Shared types (imported by client component)
   ------------------------------------------------------------------ */

export interface BurnReportCigar {
  id: string;
  brand: string | null;
  series: string | null;
  name: string;
  format: string | null;
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

/* ------------------------------------------------------------------
   Page — server component
   ------------------------------------------------------------------ */

export default async function BurnReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: item, error } = await supabase
    .from("humidor_items")
    .select("id, cigar_id, quantity, cigar:cigar_catalog(id, brand, series, name, format)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) notFound();

  const { data: flavorTags } = await supabase
    .from("flavor_tags")
    .select("id, name, category")
    .order("category")
    .order("name");

  return (
    <BurnReport
      item={item as unknown as BurnReportItem}
      flavorTags={(flavorTags ?? []) as FlavorTag[]}
    />
  );
}
