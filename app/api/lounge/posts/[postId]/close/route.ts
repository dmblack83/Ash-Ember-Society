import { NextRequest, NextResponse } from "next/server";
import { createClient }             from "@/utils/supabase/server";
import { getServerUser }            from "@/lib/auth/server-user";

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

  const { error } = await supabase
    .from("forum_posts")
    .update({ status: "closed" })
    .eq("id", postId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
