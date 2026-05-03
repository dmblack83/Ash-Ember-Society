import { createClient }  from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { getProfileLite } from "@/lib/data/profile";
import { getFlavorTags }  from "@/lib/data/flavor-tags";
import { notFound, redirect } from "next/navigation";
import { BurnReport } from "@/components/humidor/BurnReport";

export const runtime = "edge";

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

  const [{ data: item, error }, profile, flavorTagData] =
    await Promise.all([
      supabase
        .from("humidor_items")
        .select("id, cigar_id, quantity, cigar:cigar_catalog(id, brand, series, format, image_url, wrapper)")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      /* React.cache()-deduped — see lib/data/profile.ts. */
      getProfileLite(user.id),
      /* Cached cross-request — see lib/data/flavor-tags.ts. */
      getFlavorTags(),
    ]);

  if (error || !item || !item.cigar_id) notFound();

  // Fetch the next sequential burn-report number for this user. Used
  // by the Verdict Card masthead ("NO. 12") so the in-flight preview
  // shows the same number that will be assigned on submit.
  const { count: priorReportCount } = await supabase
    .from("smoke_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const nextReportNumber = (priorReportCount ?? 0) + 1;

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
      flavorTags={flavorTagData as FlavorTag[]}
      partnerVideos={partnerVideos}
      displayName={profile?.display_name ?? null}
      city={profile?.city ?? null}
      reportNumber={nextReportNumber}
    />
  );
}
