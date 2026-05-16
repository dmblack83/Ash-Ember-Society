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
  assign("draw_rating");
  assign("burn_rating");
  assign("construction_rating");
  assign("flavor_rating");
  assign("flavor_tag_ids");
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
     filed before the thirds feature existed and has no child row. */
  const thirdsKeys: Array<keyof BurnReportEditBody> = [
    "thirds_enabled", "third_beginning", "third_middle", "third_end",
  ];
  const anyThirds = thirdsKeys.some((k) => k in body);
  if (anyThirds) {
    const burnPayload: Record<string, unknown> = {
      smoke_log_id:   id,
      user_id:        user.id,
      thirds_enabled: !!body.thirds_enabled,
    };
    if ("third_beginning" in body) burnPayload.third_beginning = body.third_beginning;
    if ("third_middle"    in body) burnPayload.third_middle    = body.third_middle;
    if ("third_end"       in body) burnPayload.third_end       = body.third_end;

    const { error: brError } = await supabase
      .from("burn_reports")
      .upsert(burnPayload, { onConflict: "smoke_log_id" });

    if (brError) {
      /* Match POST behavior: log and continue. The smoke_log update
         already succeeded; losing thirds metadata is acceptable. */
      console.error("[burn-report PATCH] burn_reports upsert failed:", brError.message);
    }
  }

  return NextResponse.json({ smoke_log_id: id });
}
