import { createClient }       from "@/utils/supabase/server";
import { redirect }           from "next/navigation";
import { getMembershipTier }  from "@/lib/membership";
import { ChannelsClient }     from "@/components/discover/ChannelsClient";

export const metadata = { title: "Partner Channels — Ash & Ember Society" };

/* ------------------------------------------------------------------
   Types — exported so ChannelsClient can import them
   ------------------------------------------------------------------ */

export interface ChannelVideo {
  id:               string;
  youtube_video_id: string;
  title:            string;
  thumbnail_url:    string | null;
  published_at:     string | null;
  view_count:       number;
  duration_seconds: number | null;
  position:         number;
  like_count:       number;
  comment_count:    number;
  user_has_liked:   boolean;
}

export interface Channel {
  id:               string;
  name:             string;
  handle:           string;
  description:      string | null;
  thumbnail_url:    string | null;
  subscriber_count: number | null;
  last_synced_at:   string | null;
  videos:           ChannelVideo[];
}

/* ------------------------------------------------------------------
   Page — auth only. All data fetching lives in ChannelsClient.
   ------------------------------------------------------------------ */

export default async function ChannelsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .single();

  const tier = getMembershipTier(profileData);

  return <ChannelsClient userId={user.id} tier={tier} />;
}
