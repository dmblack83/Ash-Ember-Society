import { NextRequest, NextResponse } from "next/server";
import { createClient }             from "@/utils/supabase/server";
import { createServiceClient }      from "@/utils/supabase/service";

/**
 * POST /api/avatar
 *
 * Handles avatar uploads server-side using the service-role client so
 * storage RLS policies never block the operation.
 *
 * Flow:
 *   1. Verify the caller is authenticated (user-scoped client)
 *   2. Remove any existing avatar files under {userId}/
 *   3. Upload the new file
 *   4. Update profiles.avatar_url
 *   5. Return the public URL
 */
export async function POST(request: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const admin = createServiceClient();
  const ext   = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path  = `${user.id}/avatar.${ext}`;

  // 3. Remove all existing avatar files for this user
  const { data: existing } = await admin.storage.from("avatars").list(user.id);
  if (existing && existing.length > 0) {
    await admin.storage
      .from("avatars")
      .remove(existing.map((f) => `${user.id}/${f.name}`));
  }

  // 4. Upload new file
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 5. Get public URL and update profile
  const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  await admin.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);

  return NextResponse.json({ url: publicUrl });
}
