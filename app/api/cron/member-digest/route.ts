/* ------------------------------------------------------------------
   GET/POST /api/cron/member-digest

   Weekly Vercel Cron, Fridays 19:00 UTC = 12:00 PM MST (literal fixed
   UTC-7 per Dave, no DST shift; vercel.json can't carry comments so
   the schedule rationale lives here). Spec:
   docs/superpowers/specs/2026-08-24-member-digest-design.md

   Posts "This Week's New Members" to the Lounge: one forum_posts row
   (null author, is_system=false so every existing feed path, like and
   comment mechanic applies untouched) plus a denormalized roster in
   member_announcement_members.

   Window: since the previous digest post; the FIRST run ever falls
   back to 14 days (the launch post, triggered once manually via
   x-sync-secret on deploy day). Zero joins in the window = no post.

   ?dry=1 returns the would-be payload without writing anything.

   Auth: same pattern as /api/cron/aging-ready.
   ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor }    from "@/utils/supabase/service";
import { startCronRun, finishCronRun } from "@/lib/cron-log";
import {
  DIGEST_TITLE,
  digestWindowStart,
  digestContent,
} from "@/lib/lounge/member-digest";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;

  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const sync = req.headers.get("x-sync-secret");
  if (syncSecret && sync === syncSecret) return true;

  if (process.env.NODE_ENV !== "production") {
    const ua = req.headers.get("user-agent") ?? "";
    if (!cronSecret && ua.startsWith("vercel-cron/")) return true;
  }

  return false;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const run = dry ? null : await startCronRun("member-digest", "0 19 * * 5");

  try {
    const supabase = createServiceClientFor(
      "cron:member-digest",
      "writes the weekly new-member Lounge post as the system (null author); reads all profiles for the join window"
    );

    /* Previous digest: digest posts are the only null-author posts
       carrying the digest title (users cannot author with a null id). */
    const { data: lastRows, error: lastErr } = await supabase
      .from("forum_posts")
      .select("created_at")
      .eq("title", DIGEST_TITLE)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(`last-digest lookup: ${lastErr.message}`);

    const lastDigestAt = lastRows?.[0]?.created_at ?? null;
    const since = digestWindowStart(lastDigestAt, new Date());

    /* New members: onboarding completed, profile created in the window. */
    const { data: members, error: memErr } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, avatar_url, created_at")
      .eq("onboarding_completed", true)
      .gt("created_at", since.toISOString())
      .order("created_at", { ascending: true });
    if (memErr) throw new Error(`profiles query: ${memErr.message}`);

    const roster = (members ?? []).map((m, i) => ({
      user_id:      m.id as string,
      display_name: (m.display_name as string | null) ?? (m.first_name as string | null) ?? "A new member",
      avatar_url:   (m.avatar_url as string | null) ?? null,
      position:     i,
    }));

    if (dry) {
      return NextResponse.json({
        dry: true,
        since: since.toISOString(),
        lastDigestAt,
        count: roster.length,
        content: digestContent(roster.length),
        roster,
      });
    }

    if (roster.length === 0) {
      await finishCronRun(run!, { ok: true, error: null });
      return NextResponse.json({ ok: true, posted: false, reason: "no new members in window" });
    }

    /* General category — the digest lives in the main room. */
    const { data: cat, error: catErr } = await supabase
      .from("forum_categories")
      .select("id")
      .eq("slug", "general-discussion")
      .single();
    if (catErr || !cat) throw new Error(`category lookup: ${catErr?.message ?? "not found"}`);

    const { data: post, error: postErr } = await supabase
      .from("forum_posts")
      .insert({
        title:       DIGEST_TITLE,
        content:     digestContent(roster.length),
        user_id:     null,
        category_id: cat.id,
        is_system:   false,
        is_pinned:   false,
        is_locked:   false,
        status:      "open",
      })
      .select("id")
      .single();
    if (postErr || !post) throw new Error(`post insert: ${postErr?.message ?? "no row"}`);

    const { error: rosterErr } = await supabase
      .from("member_announcement_members")
      .insert(roster.map((r) => ({ ...r, post_id: post.id })));
    if (rosterErr) {
      /* Roster failed — remove the bare post rather than shipping a
         digest with no members behind it. */
      await supabase.from("forum_posts").delete().eq("id", post.id);
      throw new Error(`roster insert: ${rosterErr.message}`);
    }

    await finishCronRun(run!, { ok: true, error: null });
    return NextResponse.json({ ok: true, posted: true, postId: post.id, count: roster.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[member-digest] failed:", message);
    if (run) await finishCronRun(run, { ok: false, error: message.slice(0, 500) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
