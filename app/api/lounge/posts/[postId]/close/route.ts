import { NextRequest, NextResponse } from "next/server";
import { createClient }             from "@/utils/supabase/server";
import { getServerUser }            from "@/lib/auth/server-user";
import { createServiceClientFor }   from "@/utils/supabase/service";

export const runtime = "edge";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;

  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("assigned_badges")
    .eq("id", user.id)
    .single();

  const isFounder = (profile?.assigned_badges ?? []).includes("founder");
  if (!isFounder) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Founders close any member's feedback post; RLS scopes updates to the
  // author, so the RLS-bound client silently updates 0 rows. The founder gate
  // above is the authorization, so the write uses the service-role client.
  const admin = createServiceClientFor(
    "api/lounge/posts/close",
    "close any member's feedback post — founder gate runs before this call",
  );

  const { data: updated, error } = await admin
    .from("forum_posts")
    .update({ status: "closed" })
    .eq("id", postId)
    .select("id");

  if (error)             return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated?.length)  return NextResponse.json({ error: "Post not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
