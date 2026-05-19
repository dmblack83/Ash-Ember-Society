import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { createClient }               from "@/utils/supabase/server";
import { getServerUser }              from "@/lib/auth/server-user";
import { createServiceClientFor }     from "@/utils/supabase/service";

export const runtime = "edge";

/* ------------------------------------------------------------------
   PATCH /api/admin/cigar-edit-suggestions/[id]

   Approve or reject a cigar_edit_suggestions row.
   Caller must have is_admin = true on their profile.

   Body: { action: "approve" | "reject" }

   Approve:
     1. Read the suggested JSONB blob.
     2. Update cigar_catalog with those fields for the suggestion's
        cigar_id.
     3. Mark suggestion approved + record reviewer + timestamp.

   Reject:
     1. Mark suggestion rejected + record reviewer + timestamp.
   ------------------------------------------------------------------ */

const ALLOWED_FIELDS = new Set([
  "brand",
  "series",
  "format",
  "ring_gauge",
  "length_inches",
  "shade",
  "wrapper",
  "wrapper_country",
  "binder_country",
  "filler_countries",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Auth + admin gate
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Body
  let body: { action: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["approve", "reject"].includes(body.action)) {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  // 3. Service-role client (gate above ran first)
  const admin = createServiceClientFor(
    "api/admin/cigar-edit-suggestions",
    "approve/reject cigar_edit_suggestions and apply approved diff to cigar_catalog; is_admin gate above",
  );

  // 4. Fetch the suggestion
  const { data: suggestion, error: fetchError } = await admin
    .from("cigar_edit_suggestions")
    .select("id, cigar_id, suggested, status")
    .eq("id", id)
    .single();

  if (fetchError || !suggestion) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }
  if (suggestion.status !== "pending") {
    return NextResponse.json(
      { error: `Suggestion already ${suggestion.status}` },
      { status: 409 },
    );
  }

  // 5. On approve, apply the diff to cigar_catalog (whitelisted fields only)
  if (body.action === "approve") {
    const raw = suggestion.suggested as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (ALLOWED_FIELDS.has(k)) patch[k] = v;
    }

    if (Object.keys(patch).length === 0) {
      /* The user submitted a suggestion that had no allowed fields.
         Shouldn't happen because the user API validates the same way,
         but guard against a malformed row. */
      return NextResponse.json({ error: "Suggestion contains no applicable fields" }, { status: 422 });
    }

    const { error: updateErr } = await admin
      .from("cigar_catalog")
      .update(patch)
      .eq("id", suggestion.cigar_id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to apply suggestion" }, { status: 500 });
    }
  }

  // 6. Mark suggestion status either way
  const newStatus = body.action === "approve" ? "approved" : "rejected";
  const { error: statusErr } = await admin
    .from("cigar_edit_suggestions")
    .update({
      status:       newStatus,
      reviewed_by:  user.id,
      reviewed_at:  new Date().toISOString(),
    })
    .eq("id", id);

  if (statusErr) {
    return NextResponse.json({ error: "Failed to record review" }, { status: 500 });
  }

  // 7. Bust any cached cigar reads — the catalog row may have changed.
  //    Mirrors the photo-approval path (app/api/admin/submissions/[id]).
  revalidateTag("cigar-catalog", "max");

  return NextResponse.json({ ok: true, action: body.action });
}
