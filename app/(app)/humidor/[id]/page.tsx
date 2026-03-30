import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import { HumidorItemClient } from "@/components/humidor/HumidorItemClient";

/* ------------------------------------------------------------------
   Types (shared with client via props)
   ------------------------------------------------------------------ */

export interface CigarDetail {
  id: string;
  brand: string;
  line: string;
  name: string;
  vitola: string;
  strength: string;
  wrapper: string;
  binder: string | null;
  filler: string | null;
  country: string;
  image_url: string | null;
  avg_rating: number | null;
}

export interface HumidorItemDetail {
  id: string;
  cigar_id: string;
  quantity: number;
  purchase_date: string | null;
  price_paid_cents: number | null;
  source: string | null;
  aging_start_date: string | null;
  notes: string | null;
  created_at: string;
  cigar: CigarDetail;
}

export interface SmokeLog {
  id: string;
  smoked_at: string;
  overall_rating: number | null;
  review_text: string | null;
}

/* ------------------------------------------------------------------
   Page — server component
   ------------------------------------------------------------------ */

export default async function HumidorItemPage({
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
    .select("*, cigar:cigars(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) notFound();

  const { data: smokeLogs } = await supabase
    .from("smoke_logs")
    .select("id, smoked_at, overall_rating, review_text")
    .eq("user_id", user.id)
    .eq("cigar_id", item.cigar_id)
    .order("smoked_at", { ascending: false });

  return (
    <HumidorItemClient
      item={item as HumidorItemDetail}
      initialSmokeLogs={(smokeLogs ?? []) as SmokeLog[]}
    />
  );
}
