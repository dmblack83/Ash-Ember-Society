/* ------------------------------------------------------------------
   PATCH /api/burn-report/[id]

   Updates a posted burn report's editable fields. Mirrors the field
   set of POST /api/burn-report but operates on existing rows by
   smoke_log_id. Photo URLs are not edited here in v1 — the create
   flow uploads photos through /api/upload/image; an edit flow that
   adds/removes photos can land separately.

   Ownership: getServerUser() proves the caller is signed in. We then
   verify the smoke_log belongs to that user before mutating — no
   editing other users' reports.

   The 1:1 burn_reports child row carries thirds metadata. We upsert
   (insert-or-update) keyed by smoke_log_id so a report that was
   filed before thirds existed can still get the child added on edit.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { getServerUser }              from "@/lib/auth/server-user";
import { createClient }               from "@/utils/supabase/server";
import { averageThirdsToQuarter, type PerThirdData } from "@/lib/burn-report/thirds";

export const runtime = "edge";

interface BurnReportEditBody {
  /* smoke_logs fields — all optional; only provided fields update */
  smoked_at?:              string;
  overall_rating?:         number;
  location?:               string | null;
  occasion?:               string | null;
  pairing_drink?:          string | null;
  pairing_food?:           string | null;
  draw_rating?:            number | null;
  burn_rating?:            number | null;
  construction_rating?:    number | null;
  flavor_rating?:          number | null;
  flavor_tag_ids?:         string[] | null;
  review_text?:            string | null;
  smoke_duration_minutes?: number | null;
  content_video_id?:       string | null;
  /* burn_reports child fields */
  thirds_enabled?:         boolean;
  third_beginning?:        string | null;
  third_middle?:           string | null;
  third_end?:              string | null;
  /* Per-third payload. When present alongside thirds_enabled=true,
     the server replaces burn_report_thirds + their flavor_tag joins
     and derives headline ratings + tag union onto smoke_logs.
     photo_index is ignored on edit (photos are read-only in v1 edit);
     existing per-third photo_urls are preserved. */
  thirds?: Array<PerThirdData & { index: 1 | 2 | 3 }>;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: BurnReportEditBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  /* Ownership check. We select the row we're about to mutate; the
     update statement below also filters by user_id as defense in
     depth (RLS would normally cover this, but explicit is cheap). */
  const { data: existing, error: lookupError } = await supabase
    .from("smoke_logs")
    .select("id, user_id")
    .eq("id",      id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError || !existing) {
    return NextResponse.json({ error: "Burn report not found" }, { status: 404 });
  }

  /* When the client sends a complete per-third payload alongside
     thirds_enabled=true, the four headline ratings + the union of
     flavor_tag_ids are server-derived (mirroring POST). The client's
     own draw_rating/etc fields are ignored in this branch — they're
     stale 0s in thirds mode. */
  const thirdsPayloadValid =
    body.thirds_enabled === true &&
    Array.isArray(body.thirds) &&
    body.thirds.length === 3;
  const headlineRatings = thirdsPayloadValid
    ? averageThirdsToQuarter(body.thirds as PerThirdData[])
    : null;
  const headlineTagUnion = thirdsPayloadValid
    ? (() => {
        const s = new Set<string>();
        for (const t of body.thirds!) for (const tagId of (t.flavor_tag_ids ?? [])) s.add(tagId);
        return Array.from(s);
      })()
    : null;

  /* Build smoke_logs update — only assign keys that were sent. We
     translate `null` to actual NULL writes (lets the client clear
     a field), and leave undefined keys alone so callers don't have
     to send a full payload to update one field. */
  const smokeLogUpdate: Record<string, unknown> = {};
  const assign = <K extends keyof BurnReportEditBody>(k: K) => {
    if (k in body) smokeLogUpdate[k as string] = body[k];
  };
  assign("smoked_at");
  assign("overall_rating");
  assign("location");
  assign("occasion");
  assign("pairing_drink");
  assign("pairing_food");
  if (!headlineRatings) {
    assign("draw_rating");
    assign("burn_rating");
    assign("construction_rating");
    assign("flavor_rating");
    assign("flavor_tag_ids");
  } else {
    smokeLogUpdate.draw_rating         = headlineRatings.draw_rating;
    smokeLogUpdate.burn_rating         = headlineRatings.burn_rating;
    smokeLogUpdate.construction_rating = headlineRatings.construction_rating;
    smokeLogUpdate.flavor_rating       = headlineRatings.flavor_rating;
    smokeLogUpdate.flavor_tag_ids      = headlineTagUnion!.length ? headlineTagUnion : null;
  }
  assign("review_text");
  assign("smoke_duration_minutes");
  assign("content_video_id");

  if (Object.keys(smokeLogUpdate).length > 0) {
    const { error: updateError } = await supabase
      .from("smoke_logs")
      .update(smokeLogUpdate)
      .eq("id",      id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  /* Upsert burn_reports child if any thirds field was sent. Upsert
     (not update) handles the case where the original report was
     filed before the thirds feature existed and has no child row.
     We need the resulting row id to scope burn_report_thirds writes. */
  const thirdsKeys: Array<keyof BurnReportEditBody> = [
    "thirds_enabled", "third_beginning", "third_middle", "third_end", "thirds",
  ];
  const anyThirds = thirdsKeys.some((k) => k in body);
  let burnReportId: string | null = null;
  if (anyThirds) {
    const burnPayload: Record<string, unknown> = {
      smoke_log_id:   id,
      user_id:        user.id,
      thirds_enabled: !!body.thirds_enabled,
    };
    if ("third_beginning" in body) burnPayload.third_beginning = body.third_beginning;
    if ("third_middle"    in body) burnPayload.third_middle    = body.third_middle;
    if ("third_end"       in body) burnPayload.third_end       = body.third_end;

    const { data: brData, error: brError } = await supabase
      .from("burn_reports")
      .upsert(burnPayload, { onConflict: "smoke_log_id" })
      .select("id")
      .single();

    if (brError || !brData) {
      /* Match POST behavior: log and continue. The smoke_log update
         already succeeded; losing thirds metadata is acceptable. */
      console.error("[burn-report PATCH] burn_reports upsert failed:", brError?.message);
    } else {
      burnReportId = brData.id;
    }
  }

  /* Replace burn_report_thirds when the client sent a complete
     per-third payload. We do delete-then-insert (rather than per-row
     diff) because the wizard's PerThirdSheet already commits the full
     in-memory state on each Save, so the payload is the source of
     truth. Existing per-third photo_urls are preserved by index — edit
     mode is photo-read-only in v1. */
  if (thirdsPayloadValid && burnReportId) {
    /* Snapshot existing photo_urls by third_index so deletion doesn't
       lose them. */
    const { data: existingThirds } = await supabase
      .from("burn_report_thirds")
      .select("third_index, photo_url")
      .eq("burn_report_id", burnReportId);
    const photoByIndex = new Map<number, string | null>();
    for (const row of existingThirds ?? []) {
      photoByIndex.set(row.third_index as number, row.photo_url as string | null);
    }

    /* Delete flavor-tag joins first (no ON DELETE CASCADE assumed),
       then the third rows themselves. */
    const { data: oldThirdIds } = await supabase
      .from("burn_report_thirds")
      .select("id")
      .eq("burn_report_id", burnReportId);
    if (oldThirdIds && oldThirdIds.length > 0) {
      const ids = oldThirdIds.map((r) => r.id as string);
      await supabase
        .from("burn_report_third_flavor_tags")
        .delete()
        .in("third_id", ids);
      await supabase
        .from("burn_report_thirds")
        .delete()
        .eq("burn_report_id", burnReportId);
    }

    const thirdsRows = body.thirds!.map((t) => ({
      burn_report_id:      burnReportId,
      user_id:             user.id,
      third_index:         t.index,
      notes:               t.notes,
      draw_rating:         t.draw_rating,
      burn_rating:         t.burn_rating,
      construction_rating: t.construction_rating,
      flavor_rating:       t.flavor_rating,
      photo_url:           photoByIndex.get(t.index) ?? null,
    }));

    const { data: insertedThirds, error: thirdsError } = await supabase
      .from("burn_report_thirds")
      .insert(thirdsRows)
      .select("id, third_index");

    if (thirdsError || !insertedThirds) {
      console.error("[burn-report PATCH] burn_report_thirds insert failed:", thirdsError?.message);
    } else {
      const joinRows: Array<{ third_id: string; flavor_tag_id: string }> = [];
      for (const inserted of insertedThirds) {
        const sourceThird = body.thirds!.find((t) => t.index === inserted.third_index);
        if (!sourceThird) continue;
        for (const tagId of (sourceThird.flavor_tag_ids ?? [])) {
          joinRows.push({ third_id: inserted.id, flavor_tag_id: tagId });
        }
      }
      if (joinRows.length) {
        const { error: joinError } = await supabase
          .from("burn_report_third_flavor_tags")
          .insert(joinRows);
        if (joinError) {
          console.error("[burn-report PATCH] burn_report_third_flavor_tags insert failed:", joinError.message);
        }
      }
    }
  }

  return NextResponse.json({ smoke_log_id: id });
}
