import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { requireAdmin }              from "@/lib/auth/admin-gate";
import { createServiceClientFor }    from "@/utils/supabase/service";
import { escapeIlikeExact }          from "@/lib/ilike-escape";

export const runtime = "edge";

/* ------------------------------------------------------------------
   PATCH /api/admin/catalog-lines/[id]      (id = cigar_lines.id)

   Direct admin edit of a cigar line. Body: any subset of
     { brand, series, merge }

   Identity changes update cigar_lines; the sync trigger fans
   brand/series out to every size row. Blend is vitola-owned and is
   edited per size via AdminSizeEditSheet.

   Renaming onto an EXISTING line (same brand + series) is a merge:
   - without { merge: true } the route answers 409 with the target
     line's summary so the UI can ask for confirmation;
   - with { merge: true } this line's size rows are repointed to the
     target (line_id + brand/series text; ids never change, humidor
     items untouched) and the now-empty source line is deleted.
   ------------------------------------------------------------------ */

const LINE_FIELDS = new Set(["brand", "series"]);

interface LineRow {
  id: string; brand: string; series: string | null;
}

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
  for (const [k, v] of Object.entries(body)) {
    if (LINE_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 422 });
  }
  if ("brand" in patch && (typeof patch.brand !== "string" || patch.brand.trim() === "")) {
    return NextResponse.json({ error: "brand cannot be empty" }, { status: 422 });
  }

  const admin = createServiceClientFor(
    "api/admin/catalog-lines",
    "direct admin edit/merge of cigar_lines; is_admin gate above",
  );

  const { data: line, error: readErr } = await admin
    .from("cigar_lines")
    .select("id, brand, series")
    .eq("id", id)
    .maybeSingle<LineRow>();
  if (readErr || !line) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  /* Does this patch rename the line? */
  const nextBrand  = ("brand"  in patch ? patch.brand  : line.brand)  as string;
  const nextSeries = ("series" in patch ? patch.series : line.series) as string | null;
  const renamed =
    nextBrand !== line.brand ||
    (nextSeries ?? "") !== (line.series ?? "");

  if (renamed) {
    const nextBrandTrimmed  = nextBrand.trim();
    const nextSeriesTrimmed = nextSeries === null ? null : nextSeries.trim();
    let targetQuery = admin
      .from("cigar_lines")
      .select("id, brand, series")
      /* Case- and whitespace-insensitive line-identity match, mirroring
         the normalized unique index (lower(btrim(...))): ILIKE with no
         wildcards in the (escaped) value is plain case-insensitive
         equality. */
      .ilike("brand", escapeIlikeExact(nextBrandTrimmed))
      .neq("id", id);
    targetQuery = nextSeriesTrimmed === null || nextSeriesTrimmed === ""
      ? targetQuery.is("series", null)
      : targetQuery.ilike("series", escapeIlikeExact(nextSeriesTrimmed));
    const { data: target } = await targetQuery.maybeSingle<LineRow>();

    if (target) {
      if (body.merge !== true) {
        const { count } = await admin
          .from("cigar_catalog")
          .select("id", { count: "exact", head: true })
          .eq("line_id", target.id);
        return NextResponse.json(
          {
            error:  "A line with that brand and series already exists.",
            code:   "line_exists",
            target: { id: target.id, brand: target.brand, series: target.series, sizeCount: count ?? 0 },
          },
          { status: 409 },
        );
      }

      /* Merge: repoint children to the target line. Edit-in-place —
         ids never change, so humidor items and burn logs are safe.
         Blend is vitola-owned, so repointed children keep their own
         blend untouched. */
      const { error: repointErr } = await admin
        .from("cigar_catalog")
        .update({ line_id: target.id, brand: target.brand, series: target.series })
        .eq("line_id", id);
      if (repointErr) {
        return NextResponse.json({ error: "Failed to move sizes to the existing line" }, { status: 500 });
      }

      const { error: delErr } = await admin
        .from("cigar_lines")
        .delete()
        .eq("id", id);
      if (delErr) {
        /* Children are safely on the target; an orphan empty line is
           re-deletable. Surface it rather than pretend success. */
        return NextResponse.json({ error: "Sizes moved, but deleting the old line failed" }, { status: 500 });
      }

      revalidateTag("cigar-catalog", "max");
      return NextResponse.json({ ok: true, merged: true, targetId: target.id });
    }
  }

  /* Plain update — the trigger propagates to children. A concurrent
     create can still race the rename; unique violation → 409. */
  const { error: updateErr } = await admin
    .from("cigar_lines")
    .update(patch)
    .eq("id", id);
  if (updateErr) {
    const conflict = updateErr.code === "23505";
    return NextResponse.json(
      { error: conflict ? "A line with that brand and series already exists." : "Failed to update line" },
      { status: conflict ? 409 : 500 },
    );
  }

  revalidateTag("cigar-catalog", "max");
  return NextResponse.json({ ok: true, merged: false });
}
