"use client";

import { useState, useEffect }  from "react";
import Image                    from "next/image";
import Link                     from "next/link";
import { createClient }         from "@/utils/supabase/client";
import { MembershipCard }       from "@/components/membership/MembershipCard";
import { Divider }              from "@/components/ui/divider";
import { Toast }                from "@/components/ui/toast";
import type { Shop }            from "@/app/(app)/discover/shops/page";
import type { MembershipTier }  from "@/lib/stripe";

/* ------------------------------------------------------------------
   Props
   ------------------------------------------------------------------ */

interface ShopDetailPageClientProps {
  shop:           Shop;
  userId:         string;
  userTier:       MembershipTier;
  isPaid:         boolean;
  displayName:    string;
  memberSince:    string | null;
  openNow:        boolean;
  hoursLabel:     string;
  recentCheckins: number;
  dayLabels:      Record<string, string>;
  days:           string[];
  formatTime:     (t: string) => string;
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */

function PartnerBadge({ shop }: { shop: Shop }) {
  if (!shop.is_partner && !shop.is_founding_partner) return null;
  const gold = shop.is_founding_partner;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
      style={{
        background: gold
          ? "linear-gradient(135deg,rgba(193,120,23,.2),rgba(212,160,74,.25))"
          : "rgba(193,120,23,.12)",
        border: `1px solid ${gold ? "rgba(212,160,74,.5)" : "rgba(193,120,23,.35)"}`,
        color: gold ? "var(--accent)" : "var(--primary)",
      }}
    >
      {shop.is_founding_partner ? "⭐ Founding Partner" : "🤝 Partner"}
    </span>
  );
}

function AmenityPill({ label }: { label: string }) {
  const ICONS: Record<string, string> = {
    lounge: "🛋", outdoor_area: "🌿", byob: "🥃",
    bar: "🍸", walk_in_humidor: "🚪", wifi: "📶",
    parking: "🅿️", events: "🎟",
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full"
      style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)", minHeight: 44 }}
    >
      <span aria-hidden="true">{ICONS[label] ?? "✦"}</span>
      {label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

/* ------------------------------------------------------------------
   Main
   ------------------------------------------------------------------ */

export function ShopDetailPageClient({
  shop,
  userId,
  userTier,
  isPaid,
  displayName,
  memberSince,
  openNow,
  hoursLabel,
  recentCheckins,
  dayLabels,
  days,
  formatTime,
}: ShopDetailPageClientProps) {
  const [checkedIn,   setCheckedIn]   = useState(false);
  const [checkingIn,  setCheckingIn]  = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);
  const [qrOpen,      setQrOpen]      = useState(false);
  const supabase = createClient();

  async function handleCheckin() {
    if (checkedIn || checkingIn) return;
    setCheckingIn(true);
    const { error } = await supabase
      .from("shop_checkins")
      .insert({ shop_id: shop.id, user_id: userId });
    if (!error) {
      setCheckedIn(true);
      setToast(`Checked in at ${shop.name} ✓`);
    } else {
      setToast("Couldn't check in — try again.");
    }
    setCheckingIn(false);
  }

  const discount = userTier === "premium" ? shop.premium_discount : shop.member_discount;
  const mapsUrl  = `https://maps.google.com/?q=${encodeURIComponent(`${shop.address}, ${shop.city}, ${shop.state}`)}`;

  return (
    <div className="min-h-screen pb-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{
          backgroundColor: "rgba(26,18,16,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href="/discover/shops"
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 44, height: 44, backgroundColor: "var(--muted)" }}
          aria-label="Back to shops"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1
            className="text-lg font-bold truncate leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {shop.name}
          </h1>
          <p className="text-xs text-muted-foreground">{shop.city}, {shop.state}</p>
        </div>
        <PartnerBadge shop={shop} />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-6">

        {/* ── Hero cover ───────────────────────────────────────────── */}
        {shop.cover_photo_url ? (
          <div className="w-full h-44 rounded-2xl overflow-hidden relative">
            <Image
              src={shop.cover_photo_url}
              alt={shop.name}
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              quality={80}
              priority
              className="object-cover"
            />
          </div>
        ) : (
          <div
            className="w-full h-32 rounded-2xl"
            style={{ background: "var(--lounge-gradient)" }}
          />
        )}

        {/* ── Info row ─────────────────────────────────────────────── */}
        <div
          className="rounded-2xl divide-y overflow-hidden"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          {/* Phone */}
          {shop.phone && (
            <a
              href={`tel:${shop.phone}`}
              className="flex items-center gap-3 px-4 active:bg-muted/50 transition-colors"
              style={{ minHeight: 56 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-muted-foreground" aria-hidden="true">
                <path d="M3 4.5A1.5 1.5 0 014.5 3H6l1.5 4-2 1.5a9 9 0 004.5 4.5l1.5-2 4 1.5v1.5A1.5 1.5 0 0114 15C8 15 3 10 3 4.5z"
                  stroke="currentColor" strokeWidth="1.3" fill="none"/>
              </svg>
              <span className="text-sm text-foreground">{shop.phone}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto text-muted-foreground" aria-hidden="true">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}

          {/* Website */}
          {shop.website && (
            <a
              href={shop.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 active:bg-muted/50 transition-colors"
              style={{ minHeight: 56 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-muted-foreground" aria-hidden="true">
                <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9 2c-2.5 2-2.5 10 0 14M2 9h14" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              <span className="text-sm text-primary truncate flex-1">
                {shop.website.replace(/^https?:\/\//, "")}
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-muted-foreground" aria-hidden="true">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}

          {/* Hours */}
          <div className="flex items-center gap-3 px-4" style={{ minHeight: 56 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-muted-foreground" aria-hidden="true">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span className="text-sm text-foreground flex-1">{hoursLabel}</span>
            <span
              className="text-xs font-semibold"
              style={{ color: openNow ? "var(--accent)" : "var(--muted-foreground)" }}
            >
              {openNow ? "Open Now" : "Closed"}
            </span>
          </div>
        </div>

        {/* ── Directions CTA ───────────────────────────────────────── */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary w-full flex items-center justify-center gap-2"
          style={{ minHeight: 52 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M9 1C5.69 1 3 3.69 3 7c0 4.9 6 10 6 10s6-5.1 6-10c0-3.31-2.69-6-6-6z"
              stroke="currentColor" strokeWidth="1.4" fill="none"/>
            <circle cx="9" cy="7" r="2" fill="currentColor"/>
          </svg>
          Get Directions
        </a>

        <Divider />

        {/* ── Amenities ────────────────────────────────────────────── */}
        {shop.amenities.length > 0 && (
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ fontFamily: "var(--font-serif)" }}>
              Amenities
            </h2>
            <div className="flex flex-wrap gap-2">
              {shop.amenities.map(a => <AmenityPill key={a} label={a} />)}
            </div>
          </section>
        )}

        {/* ── Hours table ──────────────────────────────────────────── */}
        {shop.hours && (
          <>
            <Divider />
            <section>
              <h2 className="text-base font-semibold mb-3" style={{ fontFamily: "var(--font-serif)" }}>
                Hours
              </h2>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {days.map((day, i) => {
                  const h       = shop.hours![day];
                  const isToday = day === days[new Date().getDay()];
                  return (
                    <div
                      key={day}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                      style={{
                        backgroundColor: isToday ? "rgba(193,120,23,0.08)" : i % 2 === 0 ? "var(--card)" : "transparent",
                        borderBottom: i < 6 ? "1px solid var(--border)" : "none",
                        minHeight: 48,
                      }}
                    >
                      <span className="font-medium" style={{ color: isToday ? "var(--primary)" : "var(--foreground)" }}>
                        {dayLabels[day]}
                      </span>
                      <span style={{ color: isToday ? "var(--foreground)" : "var(--muted-foreground)" }}>
                        {!h || h.closed ? "Closed" : `${formatTime(h.open)} – ${formatTime(h.close)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ── Member perks ─────────────────────────────────────────── */}
        {shop.is_partner && (
          <>
            <Divider />
            <section>
              <h2 className="text-base font-semibold mb-3" style={{ fontFamily: "var(--font-serif)" }}>
                Member Perks
              </h2>

              <div
                className="rounded-2xl p-5 space-y-4"
                style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
              >
                {isPaid && discount ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-3xl font-bold"
                        style={{ fontFamily: "var(--font-serif)", color: "var(--accent)" }}
                      >
                        {discount}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                        style={{
                          backgroundColor: "rgba(212,160,74,0.15)",
                          border: "1px solid rgba(212,160,74,0.3)",
                          color: "var(--accent)",
                        }}
                      >
                        {userTier === "premium" ? "Premium" : "Member"} Perk
                      </span>
                    </div>
                    {shop.perk_description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {shop.perk_description}
                      </p>
                    )}
                    <button
                      onClick={() => setQrOpen(true)}
                      className="btn btn-secondary w-full"
                      style={{ minHeight: 52 }}
                    >
                      Show at Checkout
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🔒</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Upgrade to unlock{" "}
                          <span style={{ color: "var(--accent)" }}>
                            {shop.member_discount ?? "exclusive discounts"}
                          </span>
                        </p>
                        {shop.perk_description && (
                          <p className="text-sm text-muted-foreground mt-1">{shop.perk_description}</p>
                        )}
                      </div>
                    </div>
                    <Link href="/account" className="btn btn-primary w-full text-center block" style={{ minHeight: 52 }}>
                      See Membership Plans
                    </Link>
                  </>
                )}
              </div>
            </section>
          </>
        )}

        <Divider />

        {/* ── Check-in ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <button
            onClick={handleCheckin}
            disabled={checkedIn || checkingIn}
            className="w-full font-semibold rounded-xl transition-all active:scale-[0.98]"
            style={{
              minHeight: 56,
              backgroundColor: checkedIn ? "var(--muted)" : "var(--secondary)",
              border:          checkedIn ? "1px solid var(--border)" : "1px solid var(--primary)",
              color:           checkedIn ? "var(--accent)"           : "var(--foreground)",
              opacity:         checkingIn ? 0.6 : 1,
            }}
          >
            {checkingIn ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border border-foreground/30 border-t-foreground rounded-full animate-spin" />
                Checking in…
              </span>
            ) : checkedIn ? (
              "Checked In ✓"
            ) : (
              "I'm Here"
            )}
          </button>

          {recentCheckins > 0 && (
            <p className="text-sm text-center text-muted-foreground">
              <span style={{ color: "var(--primary)" }}>{recentCheckins}</span>{" "}
              member{recentCheckins !== 1 ? "s" : ""} visited recently
            </p>
          )}
        </section>

      </div>

      {/* ── QR code full-screen modal ───────────────────────────────── */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
          style={{ backgroundColor: "rgba(10,7,6,0.96)", backdropFilter: "blur(8px)" }}
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-sm animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <p
              className="text-center text-sm text-muted-foreground mb-6"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Show this to the cashier
            </p>
            <MembershipCard
              userId={userId}
              displayName={displayName}
              tier={userTier}
              memberSince={memberSince}
            />
            <button
              onClick={() => setQrOpen(false)}
              className="mt-6 w-full text-center text-sm text-muted-foreground active:opacity-70"
              style={{ minHeight: 44 }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
