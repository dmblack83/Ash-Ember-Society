"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GoogleMap, useJsApiLoader, MarkerF } from "@react-google-maps/api";
import Link from "next/link";
import type { Shop } from "@/app/(app)/discover/shops/page";
import type { MembershipTier } from "@/lib/stripe";
import { distanceMiles, formatDistance } from "@/lib/geo";
import type { LatLng } from "@/lib/geo";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const SLC_CENTER: LatLng = { lat: 40.7608, lng: -111.891 };

const DARK_MAP_STYLES = [
  { elementType: "geometry",              stylers: [{ color: "#1a1210" }] },
  { elementType: "labels.text.stroke",    stylers: [{ color: "#1a1210" }] },
  { elementType: "labels.text.fill",      stylers: [{ color: "#a69080" }] },
  { featureType: "administrative",        elementType: "geometry",            stylers: [{ color: "#241c17" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill",  stylers: [{ color: "#d4a04a" }] },
  { featureType: "poi",                   elementType: "geometry",            stylers: [{ color: "#241c17" }] },
  { featureType: "poi",                   elementType: "labels.text.fill",    stylers: [{ color: "#a69080" }] },
  { featureType: "poi.park",              elementType: "geometry",            stylers: [{ color: "#1e1812" }] },
  { featureType: "poi.park",              elementType: "labels.text.fill",    stylers: [{ color: "#6b5e56" }] },
  { featureType: "road",                  elementType: "geometry",            stylers: [{ color: "#38291e" }] },
  { featureType: "road",                  elementType: "geometry.stroke",     stylers: [{ color: "#241c17" }] },
  { featureType: "road",                  elementType: "labels.text.fill",    stylers: [{ color: "#8a7e76" }] },
  { featureType: "road.highway",          elementType: "geometry",            stylers: [{ color: "#4d3a27" }] },
  { featureType: "road.highway",          elementType: "geometry.stroke",     stylers: [{ color: "#1a1210" }] },
  { featureType: "road.highway",          elementType: "labels.text.fill",    stylers: [{ color: "#c17817" }] },
  { featureType: "transit",               elementType: "geometry",            stylers: [{ color: "#2d221b" }] },
  { featureType: "water",                 elementType: "geometry",            stylers: [{ color: "#110d0b" }] },
  { featureType: "water",                 elementType: "labels.text.fill",    stylers: [{ color: "#515c6d" }] },
];

const FILTER_CHIPS = [
  { key: "lounge",          label: "Lounge"           },
  { key: "outdoor_area",    label: "Outdoor Area"     },
  { key: "byob",            label: "BYOB"             },
  { key: "bar",             label: "Bar"              },
  { key: "walk_in_humidor", label: "Walk-in Humidor"  },
  { key: "partner_only",    label: "Partner Shops"    },
];

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function markerSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.62 14 22 14 22s14-12.38 14-22C28 6.27 21.73 0 14 0z"
      fill="${color}" stroke="#1A1210" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="rgba(255,255,255,0.35)"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function markerColor(shop: Shop): string {
  if (shop.is_founding_partner) return "#D4A04A"; // gold
  if (shop.is_partner)          return "#C17817"; // amber
  return "#8A7E76";                               // ash
}

function discountForTier(shop: Shop, tier: MembershipTier): string | null {
  if (tier === "premium" && shop.premium_discount) return shop.premium_discount;
  if (tier === "member"  && shop.member_discount)  return shop.member_discount;
  if (shop.member_discount) return shop.member_discount;
  return null;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path
            d="M5.5 1L6.8 4H10L7.5 6.2L8.4 9.5L5.5 7.8L2.6 9.5L3.5 6.2L1 4H4.2L5.5 1Z"
            fill={i <= Math.round(rating) ? "var(--primary)" : "var(--muted)"}
          />
        </svg>
      ))}
      <span className="text-xs text-muted-foreground ml-0.5">{rating.toFixed(1)}</span>
    </span>
  );
}

function PartnerBadge({ shop }: { shop: Shop }) {
  if (!shop.is_partner) return null;
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{
        background: shop.is_founding_partner
          ? "linear-gradient(135deg, rgba(193,120,23,0.2), rgba(212,160,74,0.2))"
          : "rgba(193,120,23,0.12)",
        border: `1px solid ${shop.is_founding_partner ? "rgba(212,160,74,0.4)" : "rgba(193,120,23,0.3)"}`,
        color: shop.is_founding_partner ? "var(--accent)" : "var(--primary)",
      }}
    >
      {shop.is_founding_partner ? "Founding Partner" : "Partner"}
    </span>
  );
}

/* ------------------------------------------------------------------
   Marker preview card (overlaid on bottom of map)
   ------------------------------------------------------------------ */

interface PreviewCardProps {
  shop:         Shop;
  userLoc:      LatLng | null;
  userTier:     MembershipTier;
  onClose:      () => void;
}

function ShopPreviewCard({ shop, userLoc, userTier, onClose }: PreviewCardProps) {
  const dist = userLoc
    ? formatDistance(distanceMiles(userLoc, { lat: shop.lat, lng: shop.lng }))
    : null;
  const discount = discountForTier(shop, userTier);

  return (
    <div
      className="rounded-2xl p-4 animate-slide-up"
      style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold text-foreground truncate" style={{ fontFamily: "var(--font-serif)" }}>
              {shop.name}
            </p>
            <PartnerBadge shop={shop} />
          </div>
          <p className="text-xs text-muted-foreground truncate">{shop.address}, {shop.city}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {shop.rating > 0 && <StarRating rating={shop.rating} />}
            {dist && <span className="text-xs text-muted-foreground">{dist}</span>}
            {discount && (
              <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                {discount}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/discover/shops/${shop.slug}`}
            className="btn btn-primary text-xs px-3 py-1.5"
          >
            View
          </Link>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            style={{ backgroundColor: "var(--muted)" }}
            aria-label="Close preview"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   List card
   ------------------------------------------------------------------ */

interface ShopCardProps {
  shop:     Shop;
  userLoc:  LatLng | null;
  userTier: MembershipTier;
}

function ShopListCard({ shop, userLoc, userTier }: ShopCardProps) {
  const dist     = userLoc ? distanceMiles(userLoc, { lat: shop.lat, lng: shop.lng }) : null;
  const discount = discountForTier(shop, userTier);

  return (
    <Link
      href={`/discover/shops/${shop.slug}`}
      className="block rounded-xl p-4 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Cover photo or gradient placeholder */}
      {shop.cover_photo_url ? (
        <div
          className="w-full h-32 rounded-lg mb-3 overflow-hidden bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.cover_photo_url} alt={shop.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div
          className="w-full h-32 rounded-lg mb-3"
          style={{ background: "var(--lounge-gradient)", opacity: 0.6 }}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-foreground text-base leading-snug mb-0.5"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {shop.name}
          </p>
          <p className="text-xs text-muted-foreground">{shop.address}</p>
          <p className="text-xs text-muted-foreground">{shop.city}, {shop.state}</p>
        </div>
        <PartnerBadge shop={shop} />
      </div>

      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
        {shop.rating > 0 && <StarRating rating={shop.rating} />}
        {dist !== null && (
          <span className="text-xs text-muted-foreground">{formatDistance(dist)}</span>
        )}
        {discount && (
          <span
            className="text-xs font-semibold ml-auto"
            style={{ color: "var(--accent)" }}
          >
            {discount}
          </span>
        )}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface ShopsClientProps {
  shops:       Shop[];
  userTier:    MembershipTier;
  userId:      string;
  displayName: string;
  memberSince: string | null;
}

export function ShopsClient({ shops, userTier }: ShopsClientProps) {
  const [view,         setView]         = useState<"map" | "list">("map");
  const [query,        setQuery]        = useState("");
  const [filters,      setFilters]      = useState<Set<string>>(new Set());
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [userLoc,      setUserLoc]      = useState<LatLng | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id:              "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  /* Request geolocation once on mount */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* denied — SLC_CENTER fallback is already the default */ },
      { timeout: 8_000 }
    );
  }, []);

  /* Filtered + distance-sorted shops */
  const filtered = useMemo(() => {
    let result = shops.filter((shop) => {
      if (query) {
        const q = query.toLowerCase();
        if (
          !shop.name.toLowerCase().includes(q) &&
          !shop.city.toLowerCase().includes(q) &&
          !shop.address.toLowerCase().includes(q)
        ) return false;
      }
      if (filters.has("partner_only") && !shop.is_partner) return false;
      for (const f of filters) {
        if (f !== "partner_only" && !shop.amenities.includes(f)) return false;
      }
      return true;
    });

    if (userLoc) {
      result = [...result].sort(
        (a, b) =>
          distanceMiles(userLoc, { lat: a.lat, lng: a.lng }) -
          distanceMiles(userLoc, { lat: b.lat, lng: b.lng })
      );
    }
    return result;
  }, [shops, query, filters, userLoc]);

  const toggleFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const mapCenter = userLoc ?? SLC_CENTER;

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  /* ── Search + filter controls (shared between both views) ──────── */
  const SearchAndFilters = (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"
        >
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M11 11L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shops…"
          className="input w-full pl-9 pr-4 py-2.5 text-sm"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTER_CHIPS.map((chip) => {
          const active = filters.has(chip.key);
          return (
            <button
              key={chip.key}
              onClick={() => toggleFilter(chip.key)}
              className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={{
                backgroundColor: active ? "var(--primary)" : "var(--muted)",
                color:           active ? "var(--primary-foreground)" : "var(--muted-foreground)",
                border:          active ? "1px solid transparent" : "1px solid var(--border)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ── View toggle ────────────────────────────────────────────────── */
  const ViewToggle = (
    <div className="flex gap-1.5 p-4 pb-0">
      {(["map", "list"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className="px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors"
          style={{
            backgroundColor: view === v ? "var(--secondary)" : "transparent",
            color:           view === v ? "var(--foreground)" : "var(--muted-foreground)",
            border:          "1px solid var(--border)",
          }}
        >
          {v === "map" ? (
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M1 2l4 1.5L8 2l4 1.5V11l-4-1.5L5 11 1 9.5V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              Map
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M1 3h11M1 6.5h11M1 10h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              List
            </span>
          )}
        </button>
      ))}
    </div>
  );

  /* ── Map view ───────────────────────────────────────────────────── */
  if (view === "map") {
    return (
      <div className="flex flex-col h-[calc(100dvh-4rem)]">
        {ViewToggle}

        <div className="flex flex-1 overflow-hidden mt-3">
          {/* Desktop left sidebar */}
          <aside className="hidden md:flex md:flex-col md:w-[360px] md:flex-shrink-0 md:border-r md:overflow-y-auto"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="p-4 space-y-4">
              {SearchAndFilters}
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium pt-1">
                {filtered.length} shop{filtered.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {filtered.map((shop) => (
                  <ShopListCard key={shop.id} shop={shop} userLoc={userLoc} userTier={userTier} />
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No shops match your filters.</p>
                )}
              </div>
            </div>
          </aside>

          {/* Map */}
          <div className="relative flex-1">
            {/* Mobile search / filter overlay */}
            <div
              className="md:hidden absolute top-3 left-3 right-3 z-10 rounded-xl p-3 space-y-2"
              style={{
                backgroundColor: "rgba(26,18,16,0.88)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid var(--border)",
              }}
            >
              {SearchAndFilters}
            </div>

            {/* Google Map */}
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={mapCenter}
                zoom={12}
                onLoad={onMapLoad}
                options={{
                  styles:             DARK_MAP_STYLES as google.maps.MapTypeStyle[],
                  disableDefaultUI:   true,
                  zoomControl:        true,
                  zoomControlOptions: { position: 9 /* RIGHT_CENTER */ },
                  gestureHandling:    "greedy",
                }}
                onClick={() => setSelectedShop(null)}
              >
                {/* User location dot */}
                {userLoc && (
                  <MarkerF
                    position={userLoc}
                    icon={{
                      url: markerSvg("#3B82F6"),
                      scaledSize: new window.google.maps.Size(18, 23),
                    }}
                    title="Your location"
                    zIndex={10}
                  />
                )}

                {/* Shop markers */}
                {filtered.map((shop) => (
                  <MarkerF
                    key={shop.id}
                    position={{ lat: shop.lat, lng: shop.lng }}
                    icon={{
                      url: markerSvg(markerColor(shop)),
                      scaledSize: new window.google.maps.Size(28, 36),
                    }}
                    title={shop.name}
                    onClick={() => setSelectedShop(shop)}
                    zIndex={selectedShop?.id === shop.id ? 5 : 1}
                  />
                ))}
              </GoogleMap>
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: "var(--background)" }}
              >
                <div className="space-y-2 text-center">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground">Loading map…</p>
                </div>
              </div>
            )}

            {/* Marker preview card */}
            {selectedShop && (
              <div className="absolute bottom-4 left-4 right-4 z-10">
                <ShopPreviewCard
                  shop={selectedShop}
                  userLoc={userLoc}
                  userTier={userTier}
                  onClose={() => setSelectedShop(null)}
                />
              </div>
            )}

            {/* Legend */}
            <div
              className="absolute bottom-4 right-4 z-10 rounded-xl px-3 py-2 space-y-1.5 hidden md:block"
              style={{
                backgroundColor: "rgba(26,18,16,0.9)",
                backdropFilter: "blur(8px)",
                border: "1px solid var(--border)",
              }}
            >
              {[
                { color: "#D4A04A", label: "Founding Partner" },
                { color: "#C17817", label: "Partner"          },
                { color: "#8A7E76", label: "Shop"             },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── List view ──────────────────────────────────────────────────── */
  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
      {ViewToggle}

      <div className="px-0 pt-2">
        {SearchAndFilters}
      </div>

      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {filtered.length} shop{filtered.length !== 1 ? "s" : ""}
        {userLoc ? " · sorted by distance" : ""}
      </p>

      <div className="space-y-3">
        {filtered.map((shop) => (
          <ShopListCard key={shop.id} shop={shop} userLoc={userLoc} userTier={userTier} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <p className="text-muted-foreground">No shops match your filters.</p>
            <button
              onClick={() => { setQuery(""); setFilters(new Set()); }}
              className="text-sm text-primary underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
