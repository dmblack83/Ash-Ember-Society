import { NextResponse }   from "next/server";
import { createClient }   from "@/utils/supabase/server";
import { getServerUser }  from "@/lib/auth/server-user";

/* Shared admin gate for admin API routes: 401 when signed out, 403
   when the profile lacks is_admin. Returns { error: null } when the
   caller may proceed. */
export async function requireAdmin(): Promise<{ error: NextResponse | null }> {
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}
