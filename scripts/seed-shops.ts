/**
 * Seed 10 partner / non-partner cigar shops in the Salt Lake City / Utah area.
 *
 * Usage:
 *   npx tsx scripts/seed-shops.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/* ------------------------------------------------------------------
   Shop data
   ------------------------------------------------------------------ */

const shops = [
  /* ── Founding Partners ── */
  {
    slug:                "beehive-cigars",
    name:                "Beehive Cigars",
    address:             "657 S State St",
    city:                "Salt Lake City",
    state:               "UT",
    zip:                 "84111",
    lat:                 40.7549,
    lng:                 -111.8910,
    phone:               "(801) 359-3161",
    website:             "https://www.beehivecigars.com",
    description:         "Salt Lake City's premier cigar destination since 1992. Walk-in humidor stocked with over 2,000 SKUs, private lounge, and a full-service bar.",
    is_partner:          true,
    is_founding_partner: true,
    amenities:           ["lounge", "walk_in_humidor", "bar", "parking", "events"],
    member_discount:     "10% off all cigars",
    premium_discount:    "15% off all cigars",
    perk_description:    "Discount applies to all in-humidor purchases. Present your digital membership card at checkout.",
    rating:              4.8,
    total_ratings:       312,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "21:00" },
      tuesday:   { open: "10:00", close: "21:00" },
      wednesday: { open: "10:00", close: "21:00" },
      thursday:  { open: "10:00", close: "21:00" },
      friday:    { open: "10:00", close: "22:00" },
      saturday:  { open: "10:00", close: "22:00" },
      sunday:    { open: "11:00", close: "19:00" },
    },
  },
  {
    slug:                "jeeves-cigars",
    name:                "Jeeves Cigars",
    address:             "225 W 200 S",
    city:                "Salt Lake City",
    state:               "UT",
    zip:                 "84101",
    lat:                 40.7608,
    lng:                 -111.8960,
    phone:               "(801) 364-1888",
    website:             "https://www.jeevescigars.com",
    description:         "A refined downtown lounge with vaulted ceilings, leather armchairs, and a hand-picked selection of rare and limited cigars.",
    is_partner:          true,
    is_founding_partner: true,
    amenities:           ["lounge", "walk_in_humidor", "byob", "wifi", "events"],
    member_discount:     "10% off singles & bundles",
    premium_discount:    "15% off + complimentary cut & light",
    perk_description:    "Premium members also receive complimentary first cut and light on each visit.",
    rating:              4.7,
    total_ratings:       184,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "11:00", close: "20:00" },
      tuesday:   { open: "11:00", close: "20:00" },
      wednesday: { open: "11:00", close: "20:00" },
      thursday:  { open: "11:00", close: "21:00" },
      friday:    { open: "10:00", close: "22:00" },
      saturday:  { open: "10:00", close: "22:00" },
      sunday:    { open: "12:00", close: "18:00" },
    },
  },
  {
    slug:                "tobacco-leaf-slc",
    name:                "Tobacco Leaf SLC",
    address:             "3476 S 2300 E",
    city:                "Salt Lake City",
    state:               "UT",
    zip:                 "84109",
    lat:                 40.6986,
    lng:                 -111.8199,
    phone:               "(801) 484-7243",
    website:             null,
    description:         "East side neighborhood cigar shop with an impressive walk-in humidor and a relaxed outdoor smoking patio.",
    is_partner:          true,
    is_founding_partner: true,
    amenities:           ["lounge", "walk_in_humidor", "outdoor_area", "parking"],
    member_discount:     "10% off all purchases",
    premium_discount:    "15% off all purchases",
    perk_description:    "Applies to all cigars, pipe tobacco, and accessories in-store.",
    rating:              4.6,
    total_ratings:       97,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "19:00" },
      tuesday:   { open: "10:00", close: "19:00" },
      wednesday: { open: "10:00", close: "19:00" },
      thursday:  { open: "10:00", close: "19:00" },
      friday:    { open: "10:00", close: "20:00" },
      saturday:  { open: "10:00", close: "20:00" },
      sunday:    { closed: true, open: "", close: "" },
    },
  },

  /* ── Partners ── */
  {
    slug:                "casa-de-fumar",
    name:                "Casa de Fumar",
    address:             "1420 N University Ave",
    city:                "Provo",
    state:               "UT",
    zip:                 "84604",
    lat:                 40.2483,
    lng:                 -111.6586,
    phone:               "(801) 374-9920",
    website:             null,
    description:         "Provo's go-to cigar lounge, conveniently located near BYU campus. Friendly staff and a well-curated humidor.",
    is_partner:          true,
    is_founding_partner: false,
    amenities:           ["lounge", "walk_in_humidor", "parking"],
    member_discount:     "10% off cigars",
    premium_discount:    "15% off cigars",
    perk_description:    "Show your digital membership card for the discount.",
    rating:              4.4,
    total_ratings:       68,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "20:00" },
      tuesday:   { open: "10:00", close: "20:00" },
      wednesday: { open: "10:00", close: "20:00" },
      thursday:  { open: "10:00", close: "20:00" },
      friday:    { open: "10:00", close: "21:00" },
      saturday:  { open: "10:00", close: "21:00" },
      sunday:    { closed: true, open: "", close: "" },
    },
  },
  {
    slug:                "the-smoking-jacket-ogden",
    name:                "The Smoking Jacket",
    address:             "342 25th St",
    city:                "Ogden",
    state:               "UT",
    zip:                 "84401",
    lat:                 41.2234,
    lng:                 -111.9738,
    phone:               "(801) 621-5585",
    website:             "https://www.thesmokingjacketogden.com",
    description:         "Historic 25th Street lounge in a beautifully restored Victorian building. Known for weekly events and a BYOB-friendly smoking room.",
    is_partner:          true,
    is_founding_partner: false,
    amenities:           ["lounge", "walk_in_humidor", "byob", "outdoor_area", "events"],
    member_discount:     "10% off all cigars",
    premium_discount:    "15% off + free event access",
    perk_description:    "Premium members receive complimentary admission to monthly tasting events.",
    rating:              4.5,
    total_ratings:       143,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { closed: true, open: "", close: "" },
      tuesday:   { open: "12:00", close: "20:00" },
      wednesday: { open: "12:00", close: "20:00" },
      thursday:  { open: "12:00", close: "21:00" },
      friday:    { open: "11:00", close: "22:00" },
      saturday:  { open: "11:00", close: "22:00" },
      sunday:    { open: "12:00", close: "18:00" },
    },
  },
  {
    slug:                "wasatch-cigar-co",
    name:                "Wasatch Cigar Co.",
    address:             "9348 S Village Shop Dr",
    city:                "Sandy",
    state:               "UT",
    zip:                 "84094",
    lat:                 40.5963,
    lng:                 -111.8641,
    phone:               "(801) 572-8001",
    website:             null,
    description:         "Sandy's neighborhood cigar shop — friendly, knowledgeable staff and competitive pricing on all major brands.",
    is_partner:          true,
    is_founding_partner: false,
    amenities:           ["lounge", "walk_in_humidor", "parking"],
    member_discount:     "10% off in-humidor picks",
    premium_discount:    "15% off in-humidor picks",
    perk_description:    "Discount on all humidor cigars. Accessories excluded.",
    rating:              4.3,
    total_ratings:       55,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "19:00" },
      tuesday:   { open: "10:00", close: "19:00" },
      wednesday: { open: "10:00", close: "19:00" },
      thursday:  { open: "10:00", close: "19:00" },
      friday:    { open: "10:00", close: "20:00" },
      saturday:  { open: "10:00", close: "20:00" },
      sunday:    { open: "11:00", close: "17:00" },
    },
  },
  {
    slug:                "summit-smoke-park-city",
    name:                "Summit Smoke",
    address:             "1613 Bonanza Dr",
    city:                "Park City",
    state:               "UT",
    zip:                 "84060",
    lat:                 40.6461,
    lng:                 -111.4980,
    phone:               "(435) 649-2750",
    website:             null,
    description:         "Mountain-town cigar lounge steps from the ski lifts. Après-ski smokes and a heated outdoor terrace with canyon views.",
    is_partner:          true,
    is_founding_partner: false,
    amenities:           ["lounge", "walk_in_humidor", "outdoor_area", "bar", "parking"],
    member_discount:     "10% off cigars",
    premium_discount:    "15% off cigars",
    perk_description:    "Show your digital card for instant discount at checkout.",
    rating:              4.5,
    total_ratings:       78,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "21:00" },
      tuesday:   { open: "10:00", close: "21:00" },
      wednesday: { open: "10:00", close: "21:00" },
      thursday:  { open: "10:00", close: "21:00" },
      friday:    { open: "09:00", close: "22:00" },
      saturday:  { open: "09:00", close: "22:00" },
      sunday:    { open: "10:00", close: "20:00" },
    },
  },

  /* ── Non-partners ── */
  {
    slug:                "the-cigar-box-murray",
    name:                "The Cigar Box",
    address:             "4735 S 900 E",
    city:                "Murray",
    state:               "UT",
    zip:                 "84117",
    lat:                 40.6655,
    lng:                 -111.8870,
    phone:               "(801) 268-4466",
    website:             null,
    description:         "Family-run shop in Murray with a solid selection of everyday smokes at fair prices.",
    is_partner:          false,
    is_founding_partner: false,
    amenities:           ["walk_in_humidor", "parking"],
    member_discount:     null,
    premium_discount:    null,
    perk_description:    null,
    rating:              4.1,
    total_ratings:       42,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "19:00" },
      tuesday:   { open: "10:00", close: "19:00" },
      wednesday: { open: "10:00", close: "19:00" },
      thursday:  { open: "10:00", close: "19:00" },
      friday:    { open: "10:00", close: "20:00" },
      saturday:  { open: "10:00", close: "20:00" },
      sunday:    { closed: true, open: "", close: "" },
    },
  },
  {
    slug:                "utah-tobacco-cigars",
    name:                "Utah Tobacco & Cigars",
    address:             "3155 S Redwood Rd",
    city:                "West Valley City",
    state:               "UT",
    zip:                 "84119",
    lat:                 40.7083,
    lng:                 -111.9381,
    phone:               "(801) 973-9090",
    website:             null,
    description:         "West Valley's budget-friendly smoke shop with a broad selection of machine-made and premium cigars.",
    is_partner:          false,
    is_founding_partner: false,
    amenities:           ["walk_in_humidor", "parking"],
    member_discount:     null,
    premium_discount:    null,
    perk_description:    null,
    rating:              3.9,
    total_ratings:       29,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "09:00", close: "21:00" },
      tuesday:   { open: "09:00", close: "21:00" },
      wednesday: { open: "09:00", close: "21:00" },
      thursday:  { open: "09:00", close: "21:00" },
      friday:    { open: "09:00", close: "22:00" },
      saturday:  { open: "09:00", close: "22:00" },
      sunday:    { open: "10:00", close: "20:00" },
    },
  },
  {
    slug:                "cottonwood-cigars",
    name:                "Cottonwood Cigars",
    address:             "6910 S Highland Dr",
    city:                "Cottonwood Heights",
    state:               "UT",
    zip:                 "84121",
    lat:                 40.6355,
    lng:                 -111.8199,
    phone:               "(801) 944-7338",
    website:             null,
    description:         "Tucked into the Cottonwood Heights shopping corridor, this cozy shop is a local favourite for weekend smokes.",
    is_partner:          false,
    is_founding_partner: false,
    amenities:           ["lounge", "walk_in_humidor", "parking"],
    member_discount:     null,
    premium_discount:    null,
    perk_description:    null,
    rating:              4.2,
    total_ratings:       61,
    cover_photo_url:     null,
    photo_urls:          [] as string[],
    hours: {
      monday:    { open: "10:00", close: "19:00" },
      tuesday:   { open: "10:00", close: "19:00" },
      wednesday: { open: "10:00", close: "19:00" },
      thursday:  { open: "10:00", close: "19:00" },
      friday:    { open: "10:00", close: "20:00" },
      saturday:  { open: "10:00", close: "20:00" },
      sunday:    { open: "11:00", close: "17:00" },
    },
  },
];

/* ------------------------------------------------------------------
   Run
   ------------------------------------------------------------------ */

async function main() {
  console.log(`Seeding ${shops.length} shops…\n`);

  for (const shop of shops) {
    const { error } = await supabase.from("shops").upsert(shop, { onConflict: "slug" });
    if (error) {
      console.error(`  ✗  ${shop.name}:`, error.message);
    } else {
      const badge = shop.is_founding_partner ? "⭐ Founding" : shop.is_partner ? "🤝 Partner" : "  Shop    ";
      console.log(`  ✓  [${badge}] ${shop.name}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
