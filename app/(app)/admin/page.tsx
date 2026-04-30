import { redirect }          from "next/navigation";
import { createClient }      from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { AdminTasksWidget }  from "@/components/admin/AdminTasksWidget";
import type { PendingSubmission } from "@/components/admin/AdminTasksWidget";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* ── Admin gate ───────────────────────────────────────────────── */
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/home");

  /* ── Fetch pending submissions (service role to bypass RLS) ───── */
  const admin = createServiceClient();

  const { data: rows } = await admin
    .from("cigar_image_submissions")
    .select(`
      id,
      cigar_id,
      storage_path,
      created_at,
      cigar:cigar_catalog (brand, series, format),
      submitter:profiles!cigar_image_submissions_user_id_fkey (display_name)
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
        cigar_name:  cigar?.series ?? cigar?.format ?? null,
        submitter:   submitter?.display_name ?? null,
        previewUrl:  signed?.signedUrl ?? "",
        created_at:  row.created_at,
      };
    })
  );

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

      {/* Tasks widget */}
      <AdminTasksWidget initialSubmissions={submissions} />

    </div>
  );
}
