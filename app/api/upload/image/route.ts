import { NextRequest, NextResponse } from "next/server";
import { createClient }             from "@/utils/supabase/server";
import { createServiceClient }      from "@/utils/supabase/service";
import { checkImageSafety }         from "@/lib/vision-safety";

const ALLOWED_FOLDERS = ["forum-posts", "burn-reports"] as const;
type Folder = (typeof ALLOWED_FOLDERS)[number];

/**
 * POST /api/upload/image
 *
 * Server-side image upload for lounge posts and burn reports.
 * Runs strict content moderation before writing to storage.
 *
 * Body (multipart/form-data):
 *   file   — the image file
 *   folder — "forum-posts" | "burn-reports"
 *
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const file   = formData.get("file")   as File   | null;
  const folder = formData.get("folder") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!folder || !ALLOWED_FOLDERS.includes(folder as Folder)) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 10 MB" }, { status: 400 });
  }

  const bytes  = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  // 3. Content moderation — strict policy for all user-displayed images
  try {
    const safety = await checkImageSafety(base64, "strict");
    if (!safety.passed) {
      return NextResponse.json(
        { error: safety.reason ?? "Image did not pass content moderation." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Content moderation unavailable. Please try again." },
      { status: 503 }
    );
  }

  // 4. Upload to post-images bucket
  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder}/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const admin = createServiceClient();
  const { error: uploadError } = await admin.storage
    .from("post-images")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from("post-images").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
