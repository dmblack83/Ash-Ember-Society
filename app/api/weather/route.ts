import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/* ------------------------------------------------------------------
   GET /api/weather

   Query params:
     - zip  (preferred): 5-digit US ZIP. Resolves to neighborhood-
       level lat/lon, then pulls the nearest NWS station observation.
     - city (fallback):  free-text city name. Resolves via Open-Meteo
       geocoding to a city centroid, then uses Open-Meteo model
       output.

   Resolution chain:
     1. zip → zippopotam.us → lat/lon
     2. lat/lon → NWS api.weather.gov station observation (primary)
     3. lat/lon → Open-Meteo current (fallback if NWS fails or returns
        null fields)
     4. city → Open-Meteo geocoding + current (final fallback)

   Why the chain: Open-Meteo `current` is model output, NOT a real
   station reading — model vs station can disagree by 5-10°F in mtn
   valleys, especially during inversions. NWS exposes the actual
   ASOS/AWOS observation Apple Weather and similar apps consume.

   Cache: s-maxage=300 (5 min) so the strip can't go stale by 10°F
   like the prior 30-min cache permitted.
   ------------------------------------------------------------------ */

type Suitability = "perfect" | "good" | "fair" | "indoors";

const NWS_HEADERS = {
  "User-Agent": "AshAndEmberSociety (dmblack83@gmail.com)",
  Accept:       "application/geo+json",
};

function getSuitability(tempF: number, humidity: number, windMph: number): Suitability {
  if (humidity > 85 || humidity < 40 || windMph > 20 || tempF < 40 || tempF > 95) return "indoors";
  if (humidity >= 65 && humidity <= 72 && tempF >= 65 && tempF <= 80 && windMph < 10)  return "perfect";
  if (humidity >= 55 && humidity <= 80 && tempF >= 55 && tempF <= 85 && windMph < 15)  return "good";
  return "fair";
}

const SUITABILITY_LABELS: Record<Suitability, string> = {
  perfect: "Perfect",
  good:    "Good",
  fair:    "Fair",
  indoors: "Smoke Indoors",
};

const cToF    = (c: number) => c * 1.8 + 32;
const kphToMph = (k: number) => k * 0.621371;

interface ResolvedLocation {
  lat:  number;
  lon:  number;
  city: string;
}

interface CurrentReading {
  tempF:    number;
  humidity: number;
  windMph:  number;
}

/* ── ZIP → lat/lon (zippopotam.us) ─────────────────────────────── */
async function resolveZip(zip: string): Promise<ResolvedLocation | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      next: { revalidate: 86400 }, // ZIP coords don't change daily
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;
    const lat = parseFloat(place.latitude);
    const lon = parseFloat(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, city: place["place name"] ?? "" };
  } catch {
    return null;
  }
}

/* ── city → lat/lon (Open-Meteo geocoding fallback) ────────────── */
async function resolveCity(city: string): Promise<ResolvedLocation | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const loc  = data?.results?.[0];
    if (!loc) return null;
    return { lat: loc.latitude, lon: loc.longitude, city: loc.name };
  } catch {
    return null;
  }
}

/* ── lat/lon → NWS station observation ─────────────────────────── */
async function nwsObservation(lat: number, lon: number): Promise<CurrentReading | null> {
  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: NWS_HEADERS,
      next:    { revalidate: 86400 },
    });
    if (!pointsRes.ok) return null;
    const pointsJson = await pointsRes.json();
    const stationsUrl: string | undefined = pointsJson?.properties?.observationStations;
    if (!stationsUrl) return null;

    const stationsRes = await fetch(stationsUrl, {
      headers: NWS_HEADERS,
      next:    { revalidate: 86400 },
    });
    if (!stationsRes.ok) return null;
    const stationsJson = await stationsRes.json();
    const stations: Array<{ properties?: { stationIdentifier?: string } }> =
      stationsJson?.features ?? [];

    // Walk the nearest few stations until we find one reporting all fields.
    // Some stations return null temperature/humidity in their latest record.
    for (const f of stations.slice(0, 5)) {
      const id = f?.properties?.stationIdentifier;
      if (!id) continue;

      const obsRes = await fetch(
        `https://api.weather.gov/stations/${id}/observations/latest`,
        { headers: NWS_HEADERS, next: { revalidate: 300 } }
      );
      if (!obsRes.ok) continue;

      const p = (await obsRes.json())?.properties;
      const tempC    = p?.temperature?.value;
      const humidity = p?.relativeHumidity?.value;
      const windKph  = p?.windSpeed?.value;
      if (typeof tempC !== "number") continue;
      if (typeof humidity !== "number") continue;

      return {
        tempF:    cToF(tempC),
        humidity,
        windMph:  typeof windKph === "number" ? kphToMph(windKph) : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/* ── lat/lon → Open-Meteo current (fallback) ───────────────────── */
async function openMeteoCurrent(lat: number, lon: number): Promise<CurrentReading | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const cur = (await res.json())?.current;
    if (!cur) return null;
    if (typeof cur.temperature_2m       !== "number") return null;
    if (typeof cur.relative_humidity_2m !== "number") return null;
    return {
      tempF:    cur.temperature_2m,
      humidity: cur.relative_humidity_2m,
      windMph:  typeof cur.wind_speed_10m === "number" ? cur.wind_speed_10m : 0,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams;
  const zip  = sp.get("zip")?.trim()  || null;
  const city = sp.get("city")?.trim() || null;

  if (!zip && !city) {
    return NextResponse.json({ error: "zip or city param required" }, { status: 400 });
  }

  /* Resolve location → coords */
  let location: ResolvedLocation | null = null;

  if (zip && /^\d{5}$/.test(zip)) {
    location = await resolveZip(zip);
  }
  if (!location && city) {
    location = await resolveCity(city);
  }
  if (!location) {
    return NextResponse.json({ error: "location_not_found" }, { status: 404 });
  }

  /* Resolve coords → reading. NWS first, Open-Meteo fallback. */
  const reading =
    (await nwsObservation(location.lat, location.lon)) ??
    (await openMeteoCurrent(location.lat, location.lon));

  if (!reading) {
    return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
  }

  const suitability = getSuitability(reading.tempF, reading.humidity, reading.windMph);

  const body = {
    temp:        Math.round(reading.tempF),
    humidity:    Math.round(reading.humidity),
    wind:        Math.round(reading.windMph),
    code:        0, // legacy field, unused by the strip component
    city:        location.city,
    suitability,
    label:       SUITABILITY_LABELS[suitability],
  };

  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return response;
}
