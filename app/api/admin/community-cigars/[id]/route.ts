import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { createClient }               from "@/utils/supabase/server";
import { getServerUser }              from "@/lib/auth/server-user";
import { createServiceClientFor }     from "@/utils/supabase/service";

export const runtime = "edge";

/* ------------------------------------------------------------------
   /api/admin/community-cigars/[id]        (id = cigar_lines.id)

   PATCH  { action: "approve" }
     Marks the line AND all its size rows approved. The pending badge
     ("Community submission") clears everywhere.

   DELETE
     Removes the line's PENDING size rows and, if nothing remains,
     the line itself. Refuses (409) when any member's humidor item or
     burn log references a size row — the FKs are ON DELETE CASCADE,
     so an unchecked delete would silently destroy member data; the
     reference count check here is the guard.

   Caller must have is_admin = true on their profile.
   ------------------------------------------------------------------ */

async function requireAdmin() {
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.action !== "approve") {
    return NextResponse.json({ error: "action must be approve" }, { status: 400 });
  }

  const admin = createServiceClientFor(
    "api/admin/community-cigars",
    "approve community-added cigar line + sizes; is_admin gate above",
  );

  const { error: lineErr } = await admin
    .from("cigar_lines")
    .update({ approved: true })
    .eq("id", id);
  if (lineErr) {
    return NextResponse.json({ error: "Failed to approve line" }, { status: 500 });
  }

  /* approved is not in the sync trigger's column list, so children
     are updated explicitly. */
  const { error: childErr } = await admin
    .from("cigar_catalog")
    .update({ approved: true })
    .eq("line_id", id);
  if (childErr) {
    return NextResponse.json({ error: "Failed to approve sizes" }, { status: 500 });
  }

  /* Server-cached catalog reads (getCigarById/getPopularCigars) carry
     the approved flag — bust them so the badge clears immediately. */
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
    "api/admin/community-cigars",
    "delete unreferenced community-added cigar line + sizes; is_admin gate above",
  );

  /* Pending children of this line. */
  const { data: children, error: childReadErr } = await admin
    .from("cigar_catalog")
    .select("id")
    .eq("line_id", id)
    .eq("approved", false)
    .eq("community_added", true);
  if (childReadErr) {
    return NextResponse.json({ error: "Failed to read sizes" }, { status: 500 });
  }
  const childIds = (children ?? []).map((c) => c.id as string);

  /* Reference guard — MUST run before any delete: humidor_items and
     smoke_logs cigar_id FKs are ON DELETE CASCADE, so deleting a
     referenced row would silently destroy member data. */
  if (childIds.length > 0) {
    const [{ count: humidorRefs }, { count: logRefs }] = await Promise.all([
      admin.from("humidor_items").select("id", { count: "exact", head: true }).in("cigar_id", childIds),
      admin.from("smoke_logs").select("id", { count: "exact", head: true }).in("cigar_id", childIds),
    ]);
    if ((humidorRefs ?? 0) > 0 || (logRefs ?? 0) > 0) {
      return NextResponse.json(
        { error: "In use: a member's humidor or burn log references this cigar. Approve it instead." },
        { status: 409 },
      );
    }

    const { error: delChildErr } = await admin
      .from("cigar_catalog")
      .delete()
      .in("id", childIds);
    if (delChildErr) {
      return NextResponse.json({ error: "Failed to delete sizes" }, { status: 500 });
    }
  }

  /* Drop the line only when no size rows remain (approved siblings
     keep it alive). */
  const { count: remaining } = await admin
    .from("cigar_catalog")
    .select("id", { count: "exact", head: true })
    .eq("line_id", id);
  if ((remaining ?? 0) === 0) {
    const { error: delLineErr } = await admin
      .from("cigar_lines")
      .delete()
      .eq("id", id);
    if (delLineErr) {
      return NextResponse.json({ error: "Sizes removed, but deleting the line failed" }, { status: 500 });
    }
  }

  /* Bust cached catalog reads so deleted rows stop ghosting. */
  revalidateTag("cigar-catalog", "max");

  return NextResponse.json({ ok: true });
}
