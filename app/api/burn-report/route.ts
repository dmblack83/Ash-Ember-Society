/* ------------------------------------------------------------------
   POST /api/burn-report

   Single endpoint that runs the multi-step burn-report submit flow
   server-side: smoke_logs insert, burn_reports child insert, and
   humidor_items quantity decrement. Replaces the 3 direct Supabase
   client calls that used to live in components/humidor/BurnReport.tsx
   handleSubmit().

   Why a single endpoint: the offline outbox foundation (P5.6a / #310)
   is fetch-based. To make burn-report submit retry-from-offline, the
   submit flow needs to be a single fetch the outbox can capture and
   replay. As a side benefit: the multi-step transaction is now in
   one server place that can grow proper transaction handling, audit
   logging, etc. without touching the client.

   Auth + ownership: getServerUser() proves the caller is signed in.
   Then we verify the humidor_item belongs to that user before
   inserting — prevents a user from filing burn reports against
   another user's humidor items.

   Failure semantics intentionally match the old client flow:
   - smoke_logs insert failure → 500, abort
   - burn_reports insert failure → log, continue (smoke_log is still
     the source of truth; thirds metadata lost is acceptable)
   - humidor quantity update failure → log, continue
   This preserves the existing UX where a partial failure still
   surfaces a successful submit with the smoke_log saved.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { getServerUser }              from "@/lib/auth/server-user";
import { createClient }               from "@/utils/supabase/server";

export const runtime = "edge";

interface BurnReportBody {
  /* smoke_logs fields */
  cigar_id:                string;
  humidor_item_id:         string;
  smoked_at:               string;
  overall_rating:          number;
  location?:               string;
  occasion?:               string;
  pairing_drink?:          string;
  pairing_food?:           string;
  draw_rating?:            number;
  burn_rating?:            number;
  construction_rating?:    number;
  flavor_rating?:          number;
  flavor_tag_ids?:         string[];
  review_text?:            string;
  photo_urls?:             string[];
  smoke_duration_minutes?: number;
  content_video_id?:       string;
  /* burn_reports fields */
  thirds_enabled?:         boolean;
  third_beginning?:        string;
  third_middle?:           string;
  third_end?:              string;
}

export async function POST(req: NextRequest) {
  /* ── Auth ─────────────────────────────────────────────────────── */
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ── Parse body ──────────────────────────────────────────────── */
  let body: BurnReportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.cigar_id || !body.humidor_item_id || !body.smoked_at ||
      typeof body.overall_rating !== "number") {
    return NextResponse.json(
      { error: "Missing required fields: cigar_id, humidor_item_id, smoked_at, overall_rating" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  /* ── Ownership check on humidor_item ─────────────────────────── */
  const { data: item, error: itemError } = await supabase
    .from("humidor_items")
    .select("id, quantity")
    .eq("id",      body.humidor_item_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (itemError || !item) {
    return NextResponse.json({ error: "Humidor item not found" }, { status: 404 });
  }

  /* ── Build smoke_logs payload ────────────────────────────────── */
  const smokeLogPayload: Record<string, unknown> = {
    user_id:         user.id,
    cigar_id:        body.cigar_id,
    humidor_item_id: body.humidor_item_id,
    smoked_at:       body.smoked_at,
    overall_rating:  body.overall_rating,
  };
  if (body.location)              smokeLogPayload.location              = body.location;
  if (body.occasion)              smokeLogPayload.occasion              = body.occasion;
  if (body.pairing_drink)         smokeLogPayload.pairing_drink         = body.pairing_drink;
  if (body.pairing_food)          smokeLogPayload.pairing_food          = body.pairing_food;
  if (body.draw_rating)           smokeLogPayload.draw_rating           = body.draw_rating;
  if (body.burn_rating)           smokeLogPayload.burn_rating           = body.burn_rating;
  if (body.construction_rating)   smokeLogPayload.construction_rating   = body.construction_rating;
  if (body.flavor_rating)         smokeLogPayload.flavor_rating         = body.flavor_rating;
  if (body.flavor_tag_ids?.length) smokeLogPayload.flavor_tag_ids       = body.flavor_tag_ids;
  if (body.review_text)           smokeLogPayload.review_text           = body.review_text;
  if (body.photo_urls?.length)    smokeLogPayload.photo_urls            = body.photo_urls;
  if (body.smoke_duration_minutes) smokeLogPayload.smoke_duration_minutes = body.smoke_duration_minutes;
  if (body.content_video_id)      smokeLogPayload.content_video_id      = body.content_video_id;

  /* ── Insert smoke_log ────────────────────────────────────────── */
  const { data: logData, error: logError } = await supabase
    .from("smoke_logs")
    .insert(smokeLogPayload)
    .select("id")
    .single();

  if (logError || !logData) {
    return NextResponse.json(
      { error: logError?.message ?? "Failed to insert smoke log" },
      { status: 500 },
    );
  }

  /* ── Insert burn_reports child (1:1) ─────────────────────────── */
  const burnPayload: Record<string, unknown> = {
    smoke_log_id:   logData.id,
    user_id:        user.id,
    thirds_enabled: !!body.thirds_enabled,
  };
  if (body.third_beginning) burnPayload.third_beginning = body.third_beginning;
  if (body.third_middle)    burnPayload.third_middle    = body.third_middle;
  if (body.third_end)       burnPayload.third_end       = body.third_end;

  const { error: brError } = await supabase
    .from("burn_reports")
    .insert(burnPayload);

  if (brError) {
    /* Match the original client behavior: log and continue. The
       smoke_log is still a valid descriptive record; we accept
       losing thirds metadata over rolling back the parent insert. */
    console.error("[burn-report] burn_reports insert failed:", brError.message);
  }

  /* ── Decrement humidor quantity ──────────────────────────────── */
  const newQty = Math.max(0, item.quantity - 1);
  const { error: updateError } = await supabase
    .from("humidor_items")
    .update({ quantity: newQty })
    .eq("id", body.humidor_item_id);

  if (updateError) {
    console.error("[burn-report] humidor quantity update failed:", updateError.message);
  }

  return NextResponse.json({
    smoke_log_id:   logData.id,
    quantity_after: newQty,
  });
}
