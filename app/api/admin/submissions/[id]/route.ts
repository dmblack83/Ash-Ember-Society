import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { createClient }             from "@/utils/supabase/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createServiceClient }      from "@/utils/supabase/service";

/**
 * PATCH /api/admin/submissions/[id]
 *
 * Approve or reject a cigar_image_submission.
 * Caller must have is_admin = true on their profile.
 *
 * Body: { action: "approve" | "reject" }
 *
 * Approve flow:
 *   1. Download image from cigar-photos-pending
 *   2. Upload to cigar-photos (public bucket)
 *   3. Update cigar_catalog.image_url
 *   4. Mark submission approved
 *   5. Delete from cigar-photos-pending
 *
 * Reject flow:
 *   1. Mark submission rejected
 *   2. Delete from cigar-photos-pending
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Auth + admin check
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

  // 2. Parse body
  let body: { action: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["approve", "reject"].includes(body.action)) {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const admin = createServiceClient();

  // 3. Fetch the submission
  const { data: submission, error: fetchError } = await admin
    .from("cigar_image_submissions")
    .select("id, cigar_id, storage_path, status")
    .eq("id", id)
    .single();

  if (fetchError || !submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Submission is not pending" }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (body.action === "reject") {
    // Mark rejected and delete from pending bucket
    await Promise.all([
      admin
        .from("cigar_image_submissions")
        .update({ status: "rejected", reviewed_at: now, reviewed_by: user.id })
        .eq("id", id),
      admin.storage
        .from("cigar-photos-pending")
        .remove([submission.storage_path]),
    ]);

    return NextResponse.json({ ok: true });
  }

  /* ── Approve ──────────────────────────────────────────────────── */

  // 4. Download from pending bucket
  const { data: fileData, error: downloadError } = await admin.storage
    .from("cigar-photos-pending")
    .download(submission.storage_path);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Failed to download pending image" }, { status: 500 });
  }

  // 5. Upload to public cigar-photos bucket
  const ext         = submission.storage_path.split(".").pop() ?? "jpg";
  const destPath    = `${submission.cigar_id}.${ext}`;
  const bytes       = await fileData.arrayBuffer();
  const contentType = fileData.type || "image/jpeg";

  // Remove any existing image for this cigar first
  await admin.storage.from("cigar-photos").remove([destPath]);

  const { error: uploadError } = await admin.storage
    .from("cigar-photos")
    .upload(destPath, bytes, { contentType, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "Failed to upload approved image" }, { status: 500 });
  }

  // 6. Get public URL
  const { data: urlData } = admin.storage.from("cigar-photos").getPublicUrl(destPath);
  const publicUrl = urlData.publicUrl;

  // 7. Update cigar_catalog.image_url + mark submission approved + delete from pending
  await Promise.all([
    admin
      .from("cigar_catalog")
      .update({ image_url: publicUrl })
      .eq("id", submission.cigar_id),
    admin
      .from("cigar_image_submissions")
      .update({ status: "approved", reviewed_at: now, reviewed_by: user.id })
      .eq("id", id),
    admin.storage
      .from("cigar-photos-pending")
      .remove([submission.storage_path]),
  ]);

  // Approving an image mutates cigar_catalog; mark the cached catalog reads
  // stale so the next visit picks up the new image_url.
  revalidateTag("cigar-catalog", "max");

  return NextResponse.json({ ok: true, imageUrl: publicUrl });
}
