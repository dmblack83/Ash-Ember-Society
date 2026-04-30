import { createClient }  from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { notFound, redirect } from "next/navigation";
import { BurnReport } from "@/components/humidor/BurnReport";

/* ------------------------------------------------------------------
   Shared types (imported by client component)
   ------------------------------------------------------------------ */

export interface BurnReportCigar {
  id: string;
  brand: string | null;
  series: string | null;
  format: string | null;
  image_url: string | null;
  wrapper: string | null;
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

export interface PartnerVideo {
  id: string;
  youtube_video_id: string;
  title: string;
  thumbnail_url: string | null;
  position: number;
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
  const user     = await getServerUser();
  if (!user) redirect("/login");

  const [{ data: item, error }, { data: profile }, { data: flavorTagData }] =
    await Promise.all([
      supabase
        .from("humidor_items")
        .select("id, cigar_id, quantity, cigar:cigar_catalog(id, brand, series, format, image_url, wrapper)")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("profiles")
        .select("badge")
        .eq("id", user.id)
        .single(),
      supabase
        .from("flavor_tags")
        .select("id, name, category")
        .order("category")
        .order("name"),
    ]);

  if (error || !item || !item.cigar_id) notFound();

  // Fetch partner videos only if the user has the Partner badge
  let partnerVideos: PartnerVideo[] = [];
  if (profile?.badge === "partner") {
    const { data: channel } = await supabase
      .from("content_channels")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

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

  return (
    <BurnReport
      item={item as unknown as BurnReportItem}
      flavorTags={(flavorTagData ?? []) as FlavorTag[]}
      partnerVideos={partnerVideos}
    />
  );
}
