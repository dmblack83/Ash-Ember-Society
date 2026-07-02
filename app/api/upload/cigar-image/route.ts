import { NextRequest, NextResponse } from "next/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createServiceClientFor }   from "@/utils/supabase/service";

/**
 * POST /api/upload/cigar-image
 *
 * Accepts a user-submitted cigar photo, stores it in the private
 * cigar-photos-pending bucket, and inserts a cigar_image_submissions
 * record with status=pending.
 *
 * Body (multipart/form-data):
 *   file     — the image file
 *   cigar_id — uuid of the cigar in cigar_catalog
 *
 * Returns: { submissionId: string }
 */
export async function POST(request: NextRequest) {
  // 1. Auth
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file     = formData.get("file")     as File   | null;
  const cigarId  = formData.get("cigar_id") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!cigarId) {
    return NextResponse.json({ error: "cigar_id is required" }, { status: 400 });
  }
  // cigarId is interpolated into the storage path and inserted below;
  // reject anything that is not a plain UUID before it goes further.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(cigarId)) {
    return NextResponse.json({ error: "cigar_id must be a valid UUID" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 10 MB" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();

  const admin = createServiceClientFor(
    "api/upload/cigar-image",
    "cigar-photos-pending bucket write + cigar_image_submissions row; user.id from auth"
  );

  // 3. Check for existing pending submission on this cigar
  const { data: existing } = await admin
    .from("cigar_image_submissions")
    .select("id")
    .eq("cigar_id", cigarId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A photo submission for this cigar is already pending review." },
      { status: 409 }
    );
  }

  // 4. Upload to cigar-photos-pending
  const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }
  const storagePath  = `${cigarId}/${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("cigar-photos-pending")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 5. Insert submission record
  const { data: submission, error: dbError } = await admin
    .from("cigar_image_submissions")
    .insert({
      cigar_id:     cigarId,
      user_id:      user.id,
      storage_path: storagePath,
      status:       "pending",
    })
    .select("id")
    .single();

  if (dbError || !submission) {
    // Clean up the uploaded file if the DB insert fails
    await admin.storage.from("cigar-photos-pending").remove([storagePath]);
    return NextResponse.json({ error: dbError?.message ?? "Failed to save submission." }, { status: 500 });
  }

  return NextResponse.json({ submissionId: submission.id });
}
