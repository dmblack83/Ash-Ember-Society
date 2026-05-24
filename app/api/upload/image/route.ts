import { NextRequest, NextResponse } from "next/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createClient }             from "@/utils/supabase/server";
import { createServiceClientFor }   from "@/utils/supabase/service";

const ALLOWED_FOLDERS = ["forum-posts", "burn-reports"] as const;
type Folder = (typeof ALLOWED_FOLDERS)[number];

/**
 * POST /api/upload/image
 *
 * Server-side image upload for lounge posts and burn reports.
 *
 * Body (multipart/form-data):
 *   file   — the image file
 *   folder — "forum-posts" | "burn-reports"
 *
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  // 1. Auth — read proxy-forwarded headers first (fast, no Supabase round-trip).
  // Fall back to a direct Supabase auth call when the proxy timed out and
  // didn't set x-ae-* headers (e.g. slow auth during image upload).
  let userId: string;
  const proxyUser = await getServerUser();
  if (proxyUser) {
    userId = proxyUser.id;
  } else {
    const supabase = await createClient();
    const { data: { user: sbUser } } = await supabase.auth.getUser();
    if (!sbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = sbUser.id;
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

  const bytes = await file.arrayBuffer();

  // 3. Upload to post-images bucket
  const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }
  const path = `${folder}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const admin = createServiceClientFor(
    "api/upload/image",
    "post-images bucket write; path scoped to authenticated user.id under folder allowlist"
  );
  const { error: uploadError } = await admin.storage
    .from("post-images")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from("post-images").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
