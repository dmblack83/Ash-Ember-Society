import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type Suitability = "perfect" | "good" | "fair" | "indoors";

/* ------------------------------------------------------------------
   Suitability logic (mirrors SmokingConditions.tsx)
   ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------
   GET /api/weather?city=<city name>

   1. Geocodes the city via Open-Meteo geocoding API.
   2. Fetches current weather via Open-Meteo forecast API.
   3. Returns computed suitability so the client does no heavy logic.

   Cache-Control: s-maxage=1800 — Vercel CDN caches per unique city
   for 30 minutes; stale-while-revalidate allows up to 1 hour of stale
   serving while a background revalidation runs.
   ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city")?.trim();

  if (!city) {
    return NextResponse.json({ error: "city param required" }, { status: 400 });
  }

  /* ── Geocoding ────────────────────────────────────────────────── */
  let geoRes: Response;
  try {
    geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { next: { revalidate: 3600 } } // geocoding result cached 1 hour
    );
  } catch {
    return NextResponse.json({ error: "geocoding unreachable" }, { status: 502 });
  }

  if (!geoRes.ok) {
    return NextResponse.json({ error: "geocoding failed" }, { status: 502 });
  }

  const geoJson = await geoRes.json();
  const loc     = geoJson?.results?.[0];

  if (!loc) {
    // City string didn't match any known place — tell client to show NoLocation
    return NextResponse.json({ error: "city_not_found" }, { status: 404 });
  }

  /* ── Weather ──────────────────────────────────────────────────── */
  let wxRes: Response;
  try {
    wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph`,
      { next: { revalidate: 1800 } } // weather cached 30 minutes
    );
  } catch {
    return NextResponse.json({ error: "weather unreachable" }, { status: 502 });
  }

  if (!wxRes.ok) {
    return NextResponse.json({ error: "weather fetch failed" }, { status: 502 });
  }

  const wxJson  = await wxRes.json();
  const current = wxJson?.current;

  if (!current) {
    return NextResponse.json({ error: "no current weather data" }, { status: 502 });
  }

  const tempF    = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const windMph  = current.wind_speed_10m;
  const code     = current.weathercode;

  const suitability = getSuitability(tempF, humidity, windMph);

  const body = {
    temp:        Math.round(tempF),
    humidity:    Math.round(humidity),
    wind:        Math.round(windMph),
    code,
    city:        loc.name,
    suitability,
    label:       SUITABILITY_LABELS[suitability],
  };

  const response = NextResponse.json(body);
  response.headers.set(
    "Cache-Control",
    "s-maxage=1800, stale-while-revalidate=3600"
  );
  return response;
}
