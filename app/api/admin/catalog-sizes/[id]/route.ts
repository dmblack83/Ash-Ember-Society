import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { requireAdmin }              from "@/lib/auth/admin-gate";
import { createServiceClientFor }    from "@/utils/supabase/service";

export const runtime = "edge";

/* ------------------------------------------------------------------
   /api/admin/catalog-sizes/[id]        (id = cigar_catalog.id)

   PATCH  { format?, ring_gauge?, length_inches? }
     Direct admin edit of one size row (vitola). Size fields only —
     blend and identity live on the line (see catalog-lines route).

   DELETE
     Removes the size row, and its line when no sizes remain.
     Refuses (409) when a member's humidor item or burn log
     references it — the reference count is the guard (the FKs are
     RESTRICT after 20260907, but the check gives a clear message
     instead of a raw constraint error).
   ------------------------------------------------------------------ */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const n = body.name;
    if (n !== null && (typeof n !== "string" || n.length > 120)) {
      return NextResponse.json({ error: "name must be a short string or null" }, { status: 422 });
    }
    patch.name = typeof n === "string" && n.trim() === "" ? null : n;
  }
  if ("format" in body) {
    const f = body.format;
    if (f !== null && (typeof f !== "string" || f.length > 80)) {
      return NextResponse.json({ error: "format must be a short string or null" }, { status: 422 });
    }
    patch.format = f === "" ? null : f;
  }
  if ("ring_gauge" in body) {
    const g = body.ring_gauge;
    if (g !== null && (typeof g !== "number" || g < 20 || g > 90)) {
      return NextResponse.json({ error: "ring_gauge must be 20-90 or null" }, { status: 422 });
    }
    patch.ring_gauge = g;
  }
  if ("length_inches" in body) {
    const l = body.length_inches;
    if (l !== null && (typeof l !== "number" || l <= 0 || l > 12)) {
      return NextResponse.json({ error: "length_inches must be 0-12 or null" }, { status: 422 });
    }
    patch.length_inches = l;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 422 });
  }

  const admin = createServiceClientFor(
    "api/admin/catalog-sizes",
    "direct admin edit of one cigar_catalog size row; is_admin gate above",
  );

  const { error: updateErr } = await admin
    .from("cigar_catalog")
    .update(patch)
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: "Failed to update size" }, { status: 500 });
  }

  revalidateTag("cigar-catalog", "max");
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const admin = createServiceClientFor(
    "api/admin/catalog-sizes",
    "delete one unreferenced cigar_catalog size row; is_admin gate above",
  );

  /* Reference guard before any delete. */
  const [{ count: humidorRefs }, { count: logRefs }] = await Promise.all([
    admin.from("humidor_items").select("id", { count: "exact", head: true }).eq("cigar_id", id),
    admin.from("smoke_logs").select("id", { count: "exact", head: true }).eq("cigar_id", id),
  ]);
  if ((humidorRefs ?? 0) > 0 || (logRefs ?? 0) > 0) {
    return NextResponse.json(
      { error: "In use: a member's humidor or burn log references this size." },
      { status: 409 },
    );
  }

  const { data: row } = await admin
    .from("cigar_catalog")
    .select("line_id")
    .eq("id", id)
    .maybeSingle<{ line_id: string | null }>();

  const { error: delErr } = await admin
    .from("cigar_catalog")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: "Failed to delete size" }, { status: 500 });
  }

  /* Drop the line when this was its last size. */
  if (row?.line_id) {
    const { count: remaining } = await admin
      .from("cigar_catalog")
      .select("id", { count: "exact", head: true })
      .eq("line_id", row.line_id);
    if ((remaining ?? 0) === 0) {
      await admin.from("cigar_lines").delete().eq("id", row.line_id);
    }
  }

  revalidateTag("cigar-catalog", "max");
  return NextResponse.json({ ok: true });
}
