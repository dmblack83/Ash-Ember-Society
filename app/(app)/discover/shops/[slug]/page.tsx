import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getMembershipTier } from "@/lib/membership";
import { Divider } from "@/components/ui/divider";
import { ShowMembershipCardButton } from "@/components/shops/ShopDetailClient";
import type { MembershipTier } from "@/lib/stripe";
import type { Shop } from "@/app/(app)/discover/shops/page";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function isOpenNow(hours: Shop["hours"]): boolean {
  if (!hours) return false;
  const now     = new Date();
  const dayKey  = DAYS[now.getDay()];
  const dayHours = hours[dayKey];
  if (!dayHours || dayHours.closed) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= parseTime(dayHours.open) && current < parseTime(dayHours.close);
}

function mapsDeepLink(shop: Shop): string {
  const addr = encodeURIComponent(`${shop.address}, ${shop.city}, ${shop.state}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${addr}`;
}

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 9.6l-3.2 1.8.6-3.6L1.8 5.3l3.6-.5L7 1.5z"
            fill={i <= Math.round(rating) ? "var(--primary)" : "var(--muted)"}
          />
        </svg>
      ))}
      <span className="text-sm text-muted-foreground ml-0.5">{rating.toFixed(1)}</span>
    </span>
  );
}

function AmenityChip({ label }: { label: string }) {
  const ICONS: Record<string, string> = {
    lounge:          "🛋",
    outdoor_area:    "🌿",
    byob:            "🥃",
    bar:             "🍸",
    walk_in_humidor: "🚪",
    wifi:            "📶",
    parking:         "🅿️",
    events:          "🎟",
  };
  const icon  = ICONS[label] ?? "✦";
  const nicely = label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
      style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
    >
      <span aria-hidden="true">{icon}</span>
      {nicely}
    </span>
  );
}

function PartnerBadge({ shop }: { shop: Shop }) {
  if (!shop.is_partner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
      style={{
        background: shop.is_founding_partner
          ? "linear-gradient(135deg, rgba(193,120,23,0.2), rgba(212,160,74,0.25))"
          : "rgba(193,120,23,0.12)",
        border: `1px solid ${shop.is_founding_partner ? "rgba(212,160,74,0.5)" : "rgba(193,120,23,0.35)"}`,
        color: shop.is_founding_partner ? "var(--accent)" : "var(--primary)",
      }}
    >
      {shop.is_founding_partner ? "✦ Founding Partner" : "Partner"}
    </span>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("shops").select("name").eq("slug", slug).single();
  return { title: data ? `${data.name} — Ash & Ember Society` : "Shop — Ash & Ember Society" };
}

export default async function ShopDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase  = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: shopData }, { data: profileData }] = await Promise.all([
    supabase.from("shops").select("*").eq("slug", slug).single(),
    supabase.from("profiles").select("membership_tier, display_name, created_at").eq("id", user.id).single(),
  ]);

  if (!shopData) notFound();

  const shop      = shopData as Shop;
  const tier      = getMembershipTier(profileData) as MembershipTier;
  const isPaid    = tier !== "free";
  const discount  = tier === "premium" ? shop.premium_discount : shop.member_discount;
  const today     = DAYS[new Date().getDay()];
  const openNow   = isOpenNow(shop.hours);

  return (
    <div className="min-h-screen pb-24">
      {/* ── Hero ────────────────────────────────────────────────────── */}
      {shop.cover_photo_url ? (
        <div className="relative w-full h-56 md:h-72 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shop.cover_photo_url}
            alt={shop.name}
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(26,18,16,0.95) 100%)" }}
          />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              {shop.name}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PartnerBadge shop={shop} />
              {shop.rating > 0 && <StarRating rating={shop.rating} />}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative w-full h-40 flex items-end p-5"
          style={{ background: "var(--lounge-gradient)" }}
        >
          <div>
            <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              {shop.name}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PartnerBadge shop={shop} />
              {shop.rating > 0 && <StarRating rating={shop.rating} />}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-6">

        {/* ── Quick info ──────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          {/* Address */}
          <a
            href={mapsDeepLink(shop)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 group"
          >
            <span className="mt-0.5 flex-shrink-0 text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 1C5.24 1 3 3.24 3 6c0 4.1 5 9 5 9s5-4.9 5-9c0-2.76-2.24-5-5-5z"
                  stroke="currentColor" strokeWidth="1.3" fill="none"/>
                <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </span>
            <div>
              <p className="text-sm text-foreground group-hover:text-primary transition-colors">
                {shop.address}
              </p>
              <p className="text-sm text-muted-foreground">
                {shop.city}, {shop.state} {shop.zip}
              </p>
            </div>
          </a>

          {/* Phone */}
          {shop.phone && (
            <a href={`tel:${shop.phone}`} className="flex items-center gap-3 group">
              <span className="flex-shrink-0 text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 3.5A1.5 1.5 0 013.5 2H5l1.5 4-2 1a8 8 0 004.5 4.5l1-2L14 11v1.5A1.5 1.5 0 0112.5 14C6.7 14 2 9.3 2 3.5z"
                    stroke="currentColor" strokeWidth="1.3" fill="none"/>
                </svg>
              </span>
              <p className="text-sm text-foreground group-hover:text-primary transition-colors">{shop.phone}</p>
            </a>
          )}

          {/* Website */}
          {shop.website && (
            <a
              href={shop.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 group"
            >
              <span className="flex-shrink-0 text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 2c-2 2-2 8 0 12M2 8h12M2.5 5.5C4 6 6 6.5 8 6.5s4-.5 5.5-1M2.5 10.5C4 10 6 9.5 8 9.5s4 .5 5.5 1"
                    stroke="currentColor" strokeWidth="1.3"/>
                </svg>
              </span>
              <p className="text-sm text-primary truncate">{shop.website.replace(/^https?:\/\//, "")}</p>
            </a>
          )}

          {/* Open/Closed status */}
          <div className="flex items-center gap-2 pt-1">
            <span
              className="text-xs font-semibold"
              style={{ color: openNow ? "var(--accent)" : "var(--muted-foreground)" }}
            >
              {openNow ? "Open Now" : "Closed"}
            </span>
            {shop.hours && shop.hours[today] && !shop.hours[today].closed && (
              <span className="text-xs text-muted-foreground">
                · {formatTime(shop.hours[today].open)}–{formatTime(shop.hours[today].close)}
              </span>
            )}
          </div>
        </div>

        <Divider />

        {/* ── Hours ───────────────────────────────────────────────────── */}
        {shop.hours && (
          <section>
            <h2
              className="text-base font-semibold mb-3"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Hours
            </h2>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              {DAYS.map((day) => {
                const h        = shop.hours![day];
                const isToday  = day === today;
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: isToday ? "rgba(193,120,23,0.08)" : "var(--card)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      className="font-medium"
                      style={{ color: isToday ? "var(--primary)" : "var(--foreground)" }}
                    >
                      {DAY_LABELS[day]}
                    </span>
                    <span
                      style={{ color: isToday ? "var(--foreground)" : "var(--muted-foreground)" }}
                    >
                      {!h || h.closed
                        ? "Closed"
                        : `${formatTime(h.open)} – ${formatTime(h.close)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {shop.amenities.length > 0 && (
          <>
            <Divider />
            {/* ── Amenities ─────────────────────────────────────────────── */}
            <section>
              <h2
                className="text-base font-semibold mb-3"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Amenities
              </h2>
              <div className="flex flex-wrap gap-2">
                {shop.amenities.map((a) => (
                  <AmenityChip key={a} label={a} />
                ))}
              </div>
            </section>
          </>
        )}

        <Divider />

        {/* ── Member perks ────────────────────────────────────────────── */}
        {shop.is_partner && (
          <section>
            <h2
              className="text-base font-semibold mb-3"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Member Perks
            </h2>
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
            >
              {isPaid && discount ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold" style={{ color: "var(--accent)", fontFamily: "var(--font-serif)" }}>
                      {discount}
                    </span>
                    <span
                      className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "rgba(212,160,74,0.15)",
                        color: "var(--accent)",
                        border: "1px solid rgba(212,160,74,0.3)",
                      }}
                    >
                      {tier === "premium" ? "Premium" : "Member"} perk
                    </span>
                  </div>
                  {shop.perk_description && (
                    <p className="text-sm text-muted-foreground">{shop.perk_description}</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">🔒</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Upgrade to Member for{" "}
                        <span style={{ color: "var(--accent)" }}>{shop.member_discount ?? "exclusive discounts"}</span>
                      </p>
                      {shop.perk_description && (
                        <p className="text-sm text-muted-foreground mt-0.5">{shop.perk_description}</p>
                      )}
                    </div>
                  </div>
                  <a href="/membership" className="btn btn-primary w-full text-center block">
                    See Membership Plans
                  </a>
                </>
              )}
            </div>

            {/* Show Membership Card */}
            {isPaid && (
              <div className="mt-3">
                <ShowMembershipCardButton
                  userId={user.id}
                  displayName={profileData?.display_name ?? user.email?.split("@")[0] ?? "Member"}
                  tier={tier}
                  memberSince={profileData?.created_at ?? null}
                />
              </div>
            )}
          </section>
        )}

        {shop.photo_urls.length > 0 && (
          <>
            <Divider />
            {/* ── Photos ────────────────────────────────────────────────── */}
            <section>
              <h2
                className="text-base font-semibold mb-3"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Photos
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {shop.photo_urls.map((url, i) => (
                  <div key={i} className="flex-shrink-0 w-44 h-32 rounded-xl overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${shop.name} photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <Divider />

        {/* ── Reviews placeholder ─────────────────────────────────────── */}
        <section>
          <h2
            className="text-base font-semibold mb-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Reviews
          </h2>
          <div
            className="rounded-xl p-6 text-center"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-muted-foreground text-sm">Reviews coming soon.</p>
          </div>
        </section>

        {/* ── Directions CTA ──────────────────────────────────────────── */}
        <a
          href={mapsDeepLink(shop)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary w-full text-center flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1C5.24 1 3 3.24 3 6c0 4.1 5 9 5 9s5-4.9 5-9c0-2.76-2.24-5-5-5z"
              stroke="currentColor" strokeWidth="1.4" fill="none"/>
            <circle cx="8" cy="6" r="1.8" fill="currentColor"/>
          </svg>
          Get Directions
        </a>
      </div>
    </div>
  );
}
