import { createClient }           from "@/utils/supabase/server";
import { redirect, notFound }    from "next/navigation";
import { getMembershipTier }     from "@/lib/membership";
import { ShopDetailPageClient }  from "@/components/shops/ShopDetailPageClient";
import type { MembershipTier }   from "@/lib/stripe";
import type { Shop }             from "@/app/(app)/discover/shops/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("shops").select("name").eq("slug", slug).single();
  return { title: data ? `${data.name} — Ash & Ember Society` : "Shop" };
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const DAY_LABELS: Record<string, string> = {
  monday:"Monday", tuesday:"Tuesday", wednesday:"Wednesday",
  thursday:"Thursday", friday:"Friday", saturday:"Saturday", sunday:"Sunday",
};

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2,"0")} ${ampm}`;
}

function todayHoursLabel(shop: Shop): string {
  if (!shop.hours) return "Hours unavailable";
  const today = DAYS[new Date().getDay()];
  const h     = shop.hours[today];
  if (!h || h.closed) return "Closed today";
  return `${DAY_LABELS[today]}: ${formatTime(h.open)}–${formatTime(h.close)}`;
}

function isOpenNow(shop: Shop): boolean {
  if (!shop.hours) return false;
  const now    = new Date();
  const today  = DAYS[now.getDay()];
  const h      = shop.hours[today];
  if (!h || h.closed) return false;
  const cur    = now.getHours() * 60 + now.getMinutes();
  const open   = parseInt(h.open.split(":")[0]!)  * 60 + parseInt(h.open.split(":")[1]  ?? "0");
  const close  = parseInt(h.close.split(":")[0]!) * 60 + parseInt(h.close.split(":")[1] ?? "0");
  return cur >= open && cur < close;
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default async function ShopDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase  = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: shopData }, { data: profileData }, { count: recentCheckins }] =
    await Promise.all([
      supabase.from("shops").select("*").eq("slug", slug).single(),
      supabase
        .from("profiles")
        .select("membership_tier, display_name, created_at")
        .eq("id", user.id)
        .single(),
      supabase
        .from("shop_checkins")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", (await supabase.from("shops").select("id").eq("slug", slug).single()).data?.id ?? "")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  if (!shopData) notFound();

  const shop        = shopData as Shop;
  const tier        = getMembershipTier(profileData) as MembershipTier;
  const isPaid      = tier !== "free";
  const displayName = profileData?.display_name ?? user.email?.split("@")[0] ?? "Member";
  const openNow     = isOpenNow(shop);
  const hoursLabel  = todayHoursLabel(shop);

  return (
    <ShopDetailPageClient
      shop={shop}
      userId={user.id}
      userTier={tier}
      isPaid={isPaid}
      displayName={displayName}
      memberSince={profileData?.created_at ?? null}
      openNow={openNow}
      hoursLabel={hoursLabel}
      recentCheckins={recentCheckins ?? 0}
      dayLabels={DAY_LABELS}
      days={DAYS}
      formatTime={formatTime}
    />
  );
}
