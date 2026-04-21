"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GoogleMap, useJsApiLoader, MarkerF }                 from "@react-google-maps/api";
import Link                                                    from "next/link";
import type { Shop }                                           from "@/app/(app)/discover/shops/page";
import type { MembershipTier }                                 from "@/lib/stripe";
import { distanceMiles, formatDistance }                       from "@/lib/geo";
import type { LatLng }                                         from "@/lib/geo";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const UTAH_CENTER: LatLng = { lat: 40.7608, lng: -111.891 };
const RADIUS_MILES = 25;
const PARTNER_PIN    = "#C9A84C";
const NONPARTNER_PIN = "#C47B4A";

const DARK_MAP_STYLES = [
  { elementType: "geometry",                stylers: [{ color: "#1a1210" }] },
  { elementType: "labels.text.stroke",      stylers: [{ color: "#1a1210" }] },
  { elementType: "labels.text.fill",        stylers: [{ color: "#a69080" }] },
  { featureType: "administrative",          elementType: "geometry",          stylers: [{ color: "#241c17" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill",  stylers: [{ color: "#d4a04a" }] },
  { featureType: "poi",                     elementType: "geometry",          stylers: [{ color: "#241c17" }] },
  { featureType: "poi",                     elementType: "labels.text.fill",  stylers: [{ color: "#a69080" }] },
  { featureType: "poi.park",                elementType: "geometry",          stylers: [{ color: "#1e1812" }] },
  { featureType: "road",                    elementType: "geometry",          stylers: [{ color: "#38291e" }] },
  { featureType: "road",                    elementType: "geometry.stroke",   stylers: [{ color: "#241c17" }] },
  { featureType: "road",                    elementType: "labels.text.fill",  stylers: [{ color: "#8a7e76" }] },
  { featureType: "road.highway",            elementType: "geometry",          stylers: [{ color: "#4d3a27" }] },
  { featureType: "road.highway",            elementType: "labels.text.fill",  stylers: [{ color: "#c17817" }] },
  { featureType: "water",                   elementType: "geometry",          stylers: [{ color: "#110d0b" }] },
  { featureType: "water",                   elementType: "labels.text.fill",  stylers: [{ color: "#515c6d" }] },
];

/* ------------------------------------------------------------------
   Utilities
   ------------------------------------------------------------------ */

function pinSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">
    <path d="M15 0C7.27 0 1 6.27 1 14c0 10.2 14 24 14 24S29 24.2 29 14C29 6.27 22.73 0 15 0z"
      fill="${color}" stroke="#1A1210" stroke-width="1.5"/>
    <circle cx="15" cy="14" r="5" fill="rgba(255,255,255,0.3)"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function markerColor(shop: Shop): string {
  return (shop.is_partner || shop.is_founding_partner) ? PARTNER_PIN : NONPARTNER_PIN;
}

function shopScore(shop: Shop): number {
  if (shop.is_founding_partner) return 2;
  if (shop.is_partner)          return 1;
  return 0;
}

function PartnerBadge({ shop, size = "sm" }: { shop: Shop; size?: "sm" | "xs" }) {
  if (!shop.is_partner && !shop.is_founding_partner) return null;
  const px   = size === "xs" ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]";
  const gold = shop.is_founding_partner;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-widest rounded-full ${px}`}
      style={{
        background: gold
          ? "linear-gradient(135deg,rgba(193,120,23,.2),rgba(212,160,74,.25))"
          : "rgba(193,120,23,.12)",
        border: `1px solid ${gold ? "rgba(212,160,74,.5)" : "rgba(193,120,23,.35)"}`,
        color:  gold ? "var(--accent)" : "var(--primary)",
      }}
    >
      {shop.is_founding_partner ? "⭐ Founding Partner" : "🤝 Partner"}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path d="M5.5 1L6.8 4H10L7.5 6.2L8.4 9.5L5.5 7.8L2.6 9.5L3.5 6.2L1 4H4.2L5.5 1Z"
            fill={i <= Math.round(rating) ? "var(--primary)" : "var(--muted)"}/>
        </svg>
      ))}
      <span className="text-[10px] text-muted-foreground ml-0.5">{rating.toFixed(1)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------
   Shop list card
   ------------------------------------------------------------------ */

interface ShopCardProps {
  shop:     Shop;
  userLoc:  LatLng | null;
  index:    number;
  onSelect: (shop: Shop) => void;
  selected: boolean;
}

function ShopCard({ shop, userLoc, index, onSelect, selected }: ShopCardProps) {
  const dist = userLoc
    ? distanceMiles(userLoc, { lat: shop.lat, lng: shop.lng })
    : null;

  return (
    <div
      className="glass rounded-2xl overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 40}ms`,
        minHeight: 64,
        outline: selected ? "1.5px solid var(--primary)" : "none",
      }}
    >
      {/* Tap-to-select on map, link to detail page otherwise */}
      <button
        className="w-full text-left p-4 flex items-start gap-3 active:opacity-70 transition-opacity"
        onClick={() => onSelect(shop)}
        aria-label={`Select ${shop.name}`}
        style={{ minHeight: 64 }}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p
              className="font-semibold text-foreground leading-tight"
              style={{ fontFamily: "var(--font-serif)", fontSize: "1rem" }}
            >
              {shop.name}
            </p>
            <PartnerBadge shop={shop} size="xs" />
          </div>

          <p className="text-sm text-muted-foreground">
            {shop.city}, {shop.state}
            {dist !== null && (
              <span className="ml-2" style={{ color: "var(--ash)" }}>
                · {formatDistance(dist)}
              </span>
            )}
          </p>

          {shop.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {shop.amenities.slice(0, 4).map(a => (
                <span
                  key={a}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  {a.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {shop.rating > 0 && (
            <div className="pt-0.5">
              <StarRating rating={shop.rating} />
            </div>
          )}
        </div>

        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          className="flex-shrink-0 mt-1 text-muted-foreground" aria-hidden="true">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="px-4 pb-3">
        <Link
          href={`/discover/shops/${shop.slug}`}
          className="btn btn-secondary w-full text-xs py-2 text-center"
          style={{ minHeight: 44 }}
        >
          View Details
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Pin-tap bottom sheet (mobile) / inline panel (desktop)
   ------------------------------------------------------------------ */

interface PinSheetProps {
  shop:    Shop | null;
  userLoc: LatLng | null;
  onClose: () => void;
}

function PinSheet({ shop, userLoc, onClose }: PinSheetProps) {
  const dist = shop && userLoc
    ? formatDistance(distanceMiles(userLoc, { lat: shop.lat, lng: shop.lng }))
    : null;

  return (
    /* Mobile: fixed bottom sheet that slides up */
    <div
      className="fixed inset-x-0 z-30 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden"
      style={{
        bottom: "64px",
        transform: shop ? "translateY(0)" : "translateY(110%)",
      }}
      aria-hidden={!shop}
    >
      <div
        className="mx-3 mb-3 rounded-2xl p-4"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        {shop && (
          <>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
                  {shop.name}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {shop.address}, {shop.city}
                  {dist && <span className="ml-1.5">· {dist}</span>}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <PartnerBadge shop={shop} size="xs" />
                  {shop.rating > 0 && <StarRating rating={shop.rating} />}
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground active:opacity-60"
                style={{ backgroundColor: "var(--muted)", minWidth: 44, minHeight: 44 }}
                aria-label="Close"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <Link
              href={`/discover/shops/${shop.slug}`}
              className="btn btn-primary w-full text-center"
              style={{ minHeight: 44 }}
            >
              View Details
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface ShopsPageClientProps {
  shops:    Shop[];
  userTier: MembershipTier;
  userId:   string;
}

type ViewMode = "split" | "map" | "list";

export function ShopsPageClient({ shops, userTier, userId: _userId }: ShopsPageClientProps) {
  const [view,         setView]         = useState<ViewMode>("split");
  const [userLoc,      setUserLoc]      = useState<LatLng | null>(null);
  const [locDenied,    setLocDenied]    = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id:               "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  /* Geolocation */
  useEffect(() => {
    if (!navigator.geolocation) { setLocDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => setLocDenied(true),
      { timeout: 8_000 }
    );
  }, []);

  /* Filter to 25-mile radius, keep sort order (founding → partner → rest) */
  const visibleShops = useMemo(() => {
    const base = [...shops].sort((a, b) => shopScore(b) - shopScore(a));
    if (!userLoc || locDenied) return base;
    return base.filter(s =>
      distanceMiles(userLoc, { lat: s.lat, lng: s.lng }) <= RADIUS_MILES
    );
  }, [shops, userLoc, locDenied]);

  /* Distance-sort within each tier when we have location */
  const sortedShops = useMemo(() => {
    if (!userLoc) return visibleShops;
    return [...visibleShops].sort((a, b) => {
      const scoreDiff = shopScore(b) - shopScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return (
        distanceMiles(userLoc, { lat: a.lat, lng: a.lng }) -
        distanceMiles(userLoc, { lat: b.lat, lng: b.lng })
      );
    });
  }, [visibleShops, userLoc]);

  const mapCenter = userLoc ?? UTAH_CENTER;

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  /* Map height on mobile based on view mode (relative to the flex-1 container) */
  const mobileMapHeight =
    view === "map"  ? "100%" :
    view === "list" ? "0px"  :
    "50vh";                    // split default

  /* ── Shared map element ───────────────────────────────────────── */
  const MapElement = (
    <div className="relative w-full h-full">
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={mapCenter}
          zoom={11}
          onLoad={onMapLoad}
          options={{
            styles:           DARK_MAP_STYLES as google.maps.MapTypeStyle[],
            disableDefaultUI: true,
            zoomControl:      true,
            gestureHandling:  "greedy",
          }}
          onClick={() => setSelectedShop(null)}
        >
          {userLoc && (
            <MarkerF
              position={userLoc}
              icon={{ url: pinSvg("#3B82F6"), scaledSize: new window.google.maps.Size(20, 25) }}
              title="You"
              zIndex={10}
            />
          )}
          {visibleShops.map(shop => (
            <MarkerF
              key={shop.id}
              position={{ lat: shop.lat, lng: shop.lng }}
              icon={{
                url: pinSvg(markerColor(shop)),
                scaledSize: new window.google.maps.Size(30, 38),
              }}
              title={shop.name}
              onClick={() => setSelectedShop(shop)}
              zIndex={selectedShop?.id === shop.id ? 5 : 1}
            />
          ))}
        </GoogleMap>
      ) : (
        <div className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: "var(--background)" }}>
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );

  /* ── Shop list ─────────────────────────────────────────────────── */
  const ShopList = (
    <div className="p-3 space-y-3">
      {!userLoc && !locDenied && (
        <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Getting your location…
        </div>
      )}
      {locDenied && (
        <p className="text-xs text-muted-foreground px-1">
          Showing all shops — enable location for distance info.
        </p>
      )}
      {sortedShops.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">No shops within {RADIUS_MILES} miles.</p>
        </div>
      )}
      {sortedShops.map((shop, i) => (
        <ShopCard
          key={shop.id}
          shop={shop}
          userLoc={userLoc}
          index={i}
          selected={selectedShop?.id === shop.id}
          onSelect={s => {
            setSelectedShop(s);
            mapRef.current?.panTo({ lat: s.lat, lng: s.lng });
            if (view === "list") setView("split");
          }}
        />
      ))}
    </div>
  );

  /* ── Toggle bar ────────────────────────────────────────────────── */
  const ToggleBar = (
    <div
      className="flex-shrink-0 flex gap-0 border-y"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
      role="tablist"
      aria-label="View mode"
    >
      {(["map", "list"] as const).map(v => {
        const active = view === v || (v === "map" && view === "split");
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => setView(view === v && v === "map" ? "split" : v)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium capitalize transition-colors active:opacity-70"
            style={{
              color:           active ? "var(--primary)"          : "var(--muted-foreground)",
              borderBottom:    active ? "2px solid var(--primary)" : "2px solid transparent",
              minHeight:       44,
            }}
          >
            {v === "map" ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 2l4 1.5 4-1.5 4 1.5V12l-4-1.5-4 1.5L1 10.5V2z"
                    stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                Map
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 3h12M1 7h12M1 11h12"
                    stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                List
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Mobile layout ──────────────────────────────────────── */}
      <div
        className="flex flex-col md:hidden overflow-hidden"
        style={{ height: "calc(100vh - 64px)" }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-1">
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem" }}>Find a Lounge</h1>
          {userLoc && !locDenied && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {sortedShops.length} shop{sortedShops.length !== 1 ? "s" : ""} within {RADIUS_MILES} mi
            </p>
          )}
        </div>

        {/* Toggle bar — always visible above the map/list area */}
        {ToggleBar}

        {/* Map + List area — fills remaining space */}
        <div className="flex-1 relative overflow-hidden">
          {/* Map */}
          <div
            className="absolute inset-x-0 top-0 overflow-hidden transition-[height] duration-300 ease-in-out"
            style={{ height: mobileMapHeight }}
          >
            {MapElement}
          </div>

          {/* List — sits below the map */}
          <div
            className="absolute inset-x-0 bottom-0 overflow-y-auto overscroll-contain transition-[top] duration-300 ease-in-out"
            style={{ top: view === "map" ? "100%" : view === "list" ? "0px" : "50vh" }}
          >
            {ShopList}
          </div>
        </div>
      </div>

      {/* ── Desktop / tablet layout ─────────────────────────────── */}
      <div
        className="hidden md:flex overflow-hidden"
        style={{ height: "calc(100vh - 64px)" }}
      >
        {/* List panel */}
        <div
          className="flex-shrink-0 overflow-y-auto border-r"
          style={{ width: "45%", borderColor: "var(--border)" }}
        >
          <div className="px-4 pt-5 pb-2">
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem" }}>Find a Lounge</h1>
            {userLoc && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {sortedShops.length} shop{sortedShops.length !== 1 ? "s" : ""} within {RADIUS_MILES} mi
              </p>
            )}
          </div>
          {ShopList}
        </div>

        {/* Map */}
        <div className="flex-1">
          {MapElement}
        </div>
      </div>

      {/* Mobile pin-tap bottom sheet */}
      <PinSheet
        shop={selectedShop}
        userLoc={userLoc}
        onClose={() => setSelectedShop(null)}
      />
    </>
  );
}
