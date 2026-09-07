import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { requireAdmin }              from "@/lib/auth/admin-gate";
import { createServiceClientFor }    from "@/utils/supabase/service";

export const runtime = "edge";

/* POST /api/admin/catalog-sizes/[id]/merge   { targetId }
   Folds vitola [id] into targetId atomically via the
   merge_catalog_vitolas RPC: every member reference (humidor,
   burn logs, suggestions, photo submissions) repoints to the
   target, then the source row is deleted. No inventory is lost. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { targetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.targetId || typeof body.targetId !== "string") {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }
  if (body.targetId === id) {
    return NextResponse.json({ error: "Pick a different vitola to merge into" }, { status: 400 });
  }

  const admin = createServiceClientFor(
    "api/admin/catalog-sizes/merge",
    "atomic vitola merge via merge_catalog_vitolas RPC; is_admin gate above",
  );

  const { data, error } = await admin.rpc("merge_catalog_vitolas", {
    p_source: id,
    p_target: body.targetId,
  });
  if (error) {
    const missing = error.code === "PGRST202" || /not find the function/i.test(error.message ?? "");
    if (missing) {
      return NextResponse.json(
        { error: "Merge not available yet. Apply the merge_catalog_vitolas migration." },
        { status: 503 },
      );
    }
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Merge blocked: resolve pending suggestions or photo submissions on one of these vitolas first." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("cigar-catalog", "max");
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
