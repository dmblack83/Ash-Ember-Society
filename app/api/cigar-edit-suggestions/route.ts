import { NextRequest, NextResponse } from "next/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createServiceClientFor }   from "@/utils/supabase/service";
import { checkRateLimit }           from "@/lib/rate-limit";

/* ------------------------------------------------------------------
   POST /api/cigar-edit-suggestions

   Submit a user-suggested edit to a cigar_catalog row. The body
   carries:
     - cigar_id    uuid of the cigar being edited
     - current     snapshot of the editable fields as the user saw
                   them when opening the form
     - suggested   only the fields the user proposed to change
                   (already diff'd client-side; this server still
                   validates non-empty)

   On success the row lands in cigar_edit_suggestions with
   status='pending'. RLS enforces suggested_by = auth.uid().

   A unique partial index (cigar_edit_suggestions_one_pending_per_user_cigar)
   enforces one pending suggestion per (user, cigar). A duplicate
   surfaces here as a 23505 unique_violation; map to 409.
   ------------------------------------------------------------------ */

const EDITABLE_FIELDS = [
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
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

interface RequestBody {
  cigar_id:  string;
  current:   Partial<Record<EditableField, unknown>>;
  suggested: Partial<Record<EditableField, unknown>>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickEditable(
  raw: Record<string, unknown>,
): Partial<Record<EditableField, unknown>> {
  const out: Partial<Record<EditableField, unknown>> = {};
  for (const f of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, f)) {
      out[f] = raw[f];
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  // 1. Auth
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit — only user-facing write endpoint without one; same
  //    call shape and error convention as /api/push/subscribe.
  const rl = await checkRateLimit(user.id, { limit: 10, window: "1 h", prefix: "cigar-edit-suggestions" });
  if (!rl.ok) {
    if (rl.reason === "rate_limit_unavailable") {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Too many edit suggestions. Try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit":     String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset":     String(rl.reset),
          "Retry-After":           String(Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))),
        },
      },
    );
  }

  // 3. Parse + validate body
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.cigar_id || typeof body.cigar_id !== "string") {
    return NextResponse.json({ error: "cigar_id is required" }, { status: 400 });
  }
  if (!isPlainObject(body.current) || !isPlainObject(body.suggested)) {
    return NextResponse.json({ error: "current and suggested must be objects" }, { status: 400 });
  }

  const current   = pickEditable(body.current);
  const suggested = pickEditable(body.suggested);

  if (Object.keys(suggested).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  // 4. Verify the cigar exists. Service-role read because cigar_catalog
  //    has restrictive RLS and we want to confirm the row without
  //    leaking other policy nuances into this route.
  const admin = createServiceClientFor(
    "api/cigar-edit-suggestions",
    "verify cigar_catalog row exists + insert into cigar_edit_suggestions on behalf of authenticated user",
  );

  const { data: cigarRow, error: cigarErr } = await admin
    .from("cigar_catalog")
    .select("id")
    .eq("id", body.cigar_id)
    .maybeSingle();

  if (cigarErr) {
    return NextResponse.json({ error: "Failed to verify cigar" }, { status: 500 });
  }
  if (!cigarRow) {
    return NextResponse.json({ error: "Cigar not found" }, { status: 404 });
  }

  // 5. Insert. Pin suggested_by to the verified user.id; service-role
  //    bypasses RLS so we set it explicitly rather than relying on
  //    auth.uid() inside a policy.
  const { data: inserted, error: insertErr } = await admin
    .from("cigar_edit_suggestions")
    .insert({
      cigar_id:     body.cigar_id,
      suggested_by: user.id,
      current,
      suggested,
    })
    .select("id")
    .single();

  if (insertErr) {
    /* Postgres unique_violation — the unique partial index on
       (suggested_by, cigar_id) where status='pending' kicked in. */
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "You already have a pending edit suggestion for this cigar." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to submit suggestion" }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id });
}
