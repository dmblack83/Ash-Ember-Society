import { NextRequest, NextResponse } from "next/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createServiceClient }      from "@/utils/supabase/service";
import { checkImageSafety }         from "@/lib/vision-safety";

/**
 * POST /api/avatar
 *
 * Handles avatar uploads server-side using the service-role client so
 * storage RLS policies never block the operation.
 *
 * Flow:
 *   1. Verify the caller is authenticated (user-scoped client)
 *   2. Run strict content moderation via Google Vision safe-search
 *   3. Remove any existing avatar files under {userId}/
 *   4. Upload the new file
 *   5. Update profiles.avatar_url
 *   6. Return the public URL
 */
export async function POST(request: NextRequest) {
  // 1. Auth check
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse the uploaded file
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }

  const bytes  = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  // 3. Content moderation — strict policy for profile images
  try {
    const safety = await checkImageSafety(base64, "strict");
    if (!safety.passed) {
      return NextResponse.json(
        { error: safety.reason ?? "Image did not pass content moderation." },
        { status: 400 }
      );
    }
  } catch {
    // Vision API unavailable — block the upload rather than skip the check
    return NextResponse.json(
      { error: "Content moderation unavailable. Please try again." },
      { status: 503 }
    );
  }

  const admin = createServiceClient();
  const ext   = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  // Unique filename per upload so CDN never serves a stale cached version
  const path  = `${user.id}/avatar_${Date.now()}.${ext}`;

  // 4. Remove all existing avatar files for this user
  const { data: existing } = await admin.storage.from("avatars").list(user.id);
  if (existing && existing.length > 0) {
    await admin.storage
      .from("avatars")
      .remove(existing.map((f) => `${user.id}/${f.name}`));
  }

  // 5. Upload new file
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 6. Get public URL and persist to profiles
  const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: dbError } = await admin
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}
