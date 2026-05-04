import { NextRequest, NextResponse } from "next/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createServiceClient }      from "@/utils/supabase/service";
import { checkImageSafety }         from "@/lib/vision-safety";

const ALLOWED_FOLDERS = ["forum-posts", "burn-reports"] as const;
type Folder = (typeof ALLOWED_FOLDERS)[number];

/**
 * POST /api/upload/image
 *
 * Server-side image upload for lounge posts and burn reports.
 *
 * Forum posts pass through Google Vision SafeSearch (strict) before
 * writing to storage — those go on the public lounge feed.
 *
 * Burn-report uploads do NOT go through Vision. SafeSearch returns
 * VERY_LIKELY for adult and racy on legitimate cigar close-ups
 * (skin in frame), even at multi-channel agreement, so the gate was
 * blocking real users on real cigar photos. Burn reports are personal
 * smoke-log entries (the user authored the cigar entry, owns the
 * humidor item, and is logged in); when shared to the lounge they go
 * through a separate flow that re-applies the strict policy. Skipping
 * Vision here trades a low-value automated gate for letting real
 * users actually log their smokes.
 *
 * Body (multipart/form-data):
 *   file   — the image file
 *   folder — "forum-posts" | "burn-reports"
 *
 * Returns: { url: string }
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

  /*
   * 3. Content moderation.
   *
   * Forum posts: strict Vision SafeSearch (public lounge feed).
   * Burn reports: skipped — Vision is unreliable on cigar close-ups
   *   even at multi-channel agreement. See route-level jsdoc above.
   */
  if (folder === "forum-posts") {
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
