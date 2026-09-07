import { redirect }            from "next/navigation";
import { getServerUser }       from "@/lib/auth/server-user";
import { getProfileLite }      from "@/lib/data/profile";
import { createServiceClientFor } from "@/utils/supabase/service";
import { AdminTasksWidget }  from "@/components/admin/AdminTasksWidget";
import type { PendingSubmission } from "@/components/admin/AdminTasksWidget";
import { CigarEditSuggestionsWidget } from "@/components/admin/CigarEditSuggestionsWidget";
import type { PendingEditSuggestion } from "@/components/admin/CigarEditSuggestionsWidget";
import { CommunityCigarQueueWidget } from "@/components/admin/CommunityCigarQueueWidget";
import type { PendingCommunityLine } from "@/components/admin/CommunityCigarQueueWidget";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  /* ── Admin gate (cache-deduped — see lib/data/profile.ts) ────── */
  const profile = await getProfileLite(user.id);
  if (!profile?.is_admin) redirect("/home");

  /* ── Fetch pending submissions (service role to bypass RLS) ───── */
  const admin = createServiceClientFor(
    "page:admin",
    "admin moderation queue read — is_admin gate runs before this call"
  );

  const { data: rows } = await admin
    .from("cigar_image_submissions")
    .select(`
      id,
      cigar_id,
      storage_path,
      created_at,
      cigar:cigar_catalog (brand, series, name, format),
      submitter:public_profiles!cigar_image_submissions_user_id_fkey (display_name)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  /* ── Generate signed preview URLs ────────────────────────────── */
  const submissions: PendingSubmission[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      const cigar     = Array.isArray(row.cigar)     ? row.cigar[0]     : row.cigar;
      const submitter = Array.isArray(row.submitter) ? row.submitter[0] : row.submitter;

      const { data: signed } = await admin.storage
        .from("cigar-photos-pending")
        .createSignedUrl(row.storage_path, 3600); // 1hr

      return {
        id:          row.id,
        cigar_id:    row.cigar_id,
        cigar_brand: cigar?.brand  ?? null,
        cigar_name:  cigar ? [cigar.series ?? cigar.format, cigar.name ? `"${cigar.name}"` : null].filter(Boolean).join(" ") : null,
        submitter:   submitter?.display_name ?? null,
        previewUrl:  signed?.signedUrl ?? "",
        created_at:  row.created_at,
      };
    })
  );

  /* ── Fetch pending edit suggestions ──────────────────────────── */
  const { data: editRows } = await admin
    .from("cigar_edit_suggestions")
    .select(`
      id,
      cigar_id,
      current,
      suggested,
      created_at,
      cigar:cigar_catalog (brand, series),
      submitter:public_profiles!cigar_edit_suggestions_suggested_by_fkey (display_name)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const editSuggestions: PendingEditSuggestion[] = (editRows ?? []).map((row) => {
    const cigar     = Array.isArray(row.cigar)     ? row.cigar[0]     : row.cigar;
    const submitter = Array.isArray(row.submitter) ? row.submitter[0] : row.submitter;
    return {
      id:           row.id,
      cigar_id:     row.cigar_id,
      cigar_brand:  cigar?.brand  ?? null,
      cigar_series: cigar?.series ?? null,
      submitter:    submitter?.display_name ?? null,
      current:      (row.current   as Record<string, unknown>) ?? {},
      suggested:    (row.suggested as Record<string, unknown>) ?? {},
      created_at:   row.created_at,
    };
  });

  /* ── Fetch pending community-added cigar lines ───────────────── */
  /* !inner keeps only lines with at least one pending size; the
     embedded filters limit the sizes list to the pending ones. */
  const { data: communityRows } = await admin
    .from("cigar_lines")
    .select(`
      id,
      brand,
      series,
      wrapper,
      created_at,
      sizes:cigar_catalog!inner (id, format, ring_gauge, length_inches)
    `)
    .eq("sizes.approved", false)
    .eq("sizes.community_added", true)
    .order("created_at", { ascending: true });

  const communityLines: PendingCommunityLine[] = (communityRows ?? []).map((row) => ({
    id:         row.id,
    brand:      row.brand,
    series:     row.series,
    wrapper:    row.wrapper,
    created_at: row.created_at,
    sizes:      (Array.isArray(row.sizes) ? row.sizes : [row.sizes]).filter(Boolean),
  }));

  return (
    <div className="px-4 sm:px-6 pt-6 pb-10 flex flex-col gap-6 max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          Admin
        </p>
        <h1
          style={{
            fontFamily:    "var(--font-serif)",
            fontSize:      28,
            fontWeight:    700,
            color:         "var(--foreground)",
            lineHeight:    1.1,
            letterSpacing: "-0.02em",
          }}
        >
          Dashboard
        </h1>
      </div>

      {/* Community cigar queue */}
      <CommunityCigarQueueWidget initialLines={communityLines} />

      {/* Tasks widget */}
      <AdminTasksWidget initialSubmissions={submissions} />

      {/* Edit suggestions widget */}
      <CigarEditSuggestionsWidget initialSuggestions={editSuggestions} />

    </div>
  );
}
