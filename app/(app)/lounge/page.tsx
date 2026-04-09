import { createClient } from "@/utils/supabase/server";
import { redirect }     from "next/navigation";
import { LoungeClient } from "@/components/feed/LoungeClient";

export const metadata = { title: "The Lounge — Ash & Ember Society" };

export default async function LoungePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, membership_tier")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "Member";

  return <LoungeClient userId={user.id} displayName={displayName} />;
}
