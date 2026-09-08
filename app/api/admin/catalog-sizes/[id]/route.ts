import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { requireAdmin }              from "@/lib/auth/admin-gate";
import { createServiceClientFor }    from "@/utils/supabase/service";
import { escapeIlikeExact }          from "@/lib/ilike-escape";

export const runtime = "edge";

/* ------------------------------------------------------------------
   /api/admin/catalog-sizes/[id]        (id = cigar_catalog.id)

   PATCH  { name?, format?, ring_gauge?, length_inches?, shade?,
            wrapper?, wrapper_country?, binder_country?,
            filler_countries?, brand?, series? }
     Direct admin edit of one size row (vitola): size + blend fields
     patch the child directly (blend is vitola-owned). brand/series
     in the body move this vitola to (or create) that line — the
     vitola KEEPS its own blend; lines are identity only.

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
  for (const k of ["shade", "wrapper", "wrapper_country", "binder_country"] as const) {
    if (k in body) {
      const v = body[k];
      if (v !== null && (typeof v !== "string" || v.length > 80)) {
        return NextResponse.json({ error: `${k} must be a short string or null` }, { status: 422 });
      }
      patch[k] = v === "" ? null : v;
    }
  }
  if ("filler_countries" in body) {
    const v = body.filler_countries;
    if (v !== null && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) {
      return NextResponse.json({ error: "filler_countries must be a string array or null" }, { status: 422 });
    }
    patch.filler_countries = Array.isArray(v) && v.length === 0 ? null : v;
  }

  const admin = createServiceClientFor(
    "api/admin/catalog-sizes",
    "direct admin edit of one cigar_catalog size row; is_admin gate above",
  );

  /* Line reassignment: brand/series in the body move this vitola to
     (or create) that line. The vitola KEEPS its own blend — lines
     are identity only. */
  let movedLine = false;
  let oldLineId: string | null = null;
  if ("brand" in body || "series" in body) {
    const nb = body.brand;
    if ("brand" in body && (typeof nb !== "string" || nb.trim() === "")) {
      return NextResponse.json({ error: "brand cannot be empty" }, { status: 422 });
    }
    const ns = body.series;
    if ("series" in body && ns !== null && typeof ns !== "string") {
      return NextResponse.json({ error: "series must be a string or null" }, { status: 422 });
    }

    const { data: child, error: childErr } = await admin
      .from("cigar_catalog")
      .select("brand, series, line_id")
      .eq("id", id)
      .maybeSingle<{ brand: string | null; series: string | null; line_id: string | null }>();
    if (childErr) {
      return NextResponse.json({ error: "Failed to load the size row" }, { status: 500 });
    }
    if (!child) return NextResponse.json({ error: "Size not found" }, { status: 404 });
    oldLineId = child.line_id;

    const nextBrand  = ("brand"  in body ? (nb as string).trim() : child.brand) ?? "";
    const nextSeries = "series" in body ? ((ns as string | null)?.trim() || null) : child.series;
    const changed =
      nextBrand !== (child.brand ?? "") ||
      (nextSeries ?? "") !== (child.series ?? "");

    if (changed) {
      if (!nextBrand) return NextResponse.json({ error: "brand cannot be empty" }, { status: 422 });
      let destQuery = admin.from("cigar_lines")
        .select("id, brand, series")
        /* Case- and whitespace-insensitive line-identity match, mirroring
           the normalized unique index (lower(btrim(...))): ILIKE with no
           wildcards in the (escaped) value is plain case-insensitive
           equality. nextBrand/nextSeries are already trimmed above. */
        .ilike("brand", escapeIlikeExact(nextBrand));
      destQuery = nextSeries === null ? destQuery.is("series", null) : destQuery.ilike("series", escapeIlikeExact(nextSeries));
      const destRes = await destQuery.maybeSingle<{ id: string; brand: string; series: string | null }>();
      if (destRes.error) {
        return NextResponse.json({ error: "Failed to look up the destination line" }, { status: 500 });
      }
      let dest = destRes.data;
      if (!dest) {
        const { data: created, error: createErr } = await admin
          .from("cigar_lines")
          .insert({ brand: nextBrand, series: nextSeries, community_added: true, approved: false })
          .select("id, brand, series")
          .single();
        if (createErr || !created) {
          return NextResponse.json({ error: "Failed to create the destination line" }, { status: 500 });
        }
        dest = created;
      }
      patch.line_id = dest.id;
      patch.brand   = dest.brand;
      patch.series  = dest.series;
      movedLine = true;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 422 });
  }

  const { error: updateErr } = await admin
    .from("cigar_catalog")
    .update(patch)
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: "Failed to update size" }, { status: 500 });
  }

  if (movedLine && oldLineId && oldLineId !== patch.line_id) {
    /* Orphan cleanup is best-effort: the vitola already moved. Never
       delete on an unverified count; FK RESTRICT backstops anyway. */
    const { count: remaining, error: countErr } = await admin
      .from("cigar_catalog")
      .select("id", { count: "exact", head: true })
      .eq("line_id", oldLineId);
    if (countErr) {
      console.error("[catalog-sizes] orphan-line count failed; skipping cleanup", countErr);
    } else if ((remaining ?? 0) === 0) {
      const { error: orphanDelErr } = await admin.from("cigar_lines").delete().eq("id", oldLineId);
      if (orphanDelErr) {
        console.error("[catalog-sizes] orphan-line delete failed", orphanDelErr);
      }
    }
  }

  revalidateTag("cigar-catalog", "max");
  return NextResponse.json({ ok: true, movedLine });
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
