import { createClient }      from "@/utils/supabase/server";
import { redirect }          from "next/navigation";
import { PostDetailClient }  from "@/components/lounge/PostDetailClient";
import type { SmokeLogData } from "@/components/lounge/PostDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ postId: string }>;
}

export default async function PostDetailPage({ params }: Props) {
  const { postId } = await params;
  const supabase   = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [postRes, commentsRes, likeRes] = await Promise.all([
    supabase
      .from("forum_posts")
      .select(`
        id, title, content, created_at, updated_at,
        is_system, is_locked, user_id, category_id,
        image_url, smoke_log_id,
        forum_post_likes(count),
        forum_categories(name, slug)
      `)
      .eq("id", postId)
      .single(),
    supabase
      .from("forum_comments")
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    supabase
      .from("forum_post_likes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("post_id", postId),
  ]);

  if (!postRes.data) redirect("/lounge");

  const raw       = postRes.data as any;
  const likeCount = (raw.forum_post_likes as { count: number }[])[0]?.count ?? 0;

  // Separate profiles fetch — forum_posts.user_id → auth.users, not profiles directly
  const postAuthorId = raw.user_id as string | null;
  const commentRows  = (commentsRes.data ?? []) as Array<{
    id: string; content: string; created_at: string; updated_at: string;
    user_id: string; parent_comment_id: string | null;
  }>;

  const allUserIds = [
    ...new Set(
      [postAuthorId, ...commentRows.map((c) => c.user_id)].filter(Boolean) as string[]
    ),
  ];

  let nameMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
  if (allUserIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", allUserIds);
    for (const p of profileRows ?? []) {
      nameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
    }
  }

  // Fetch full smoke log if linked
  let smokeLog: SmokeLogData | null = null;
  if (raw.smoke_log_id) {
    const { data: logData } = await supabase
      .from("smoke_logs")
      .select(`
        id, smoked_at, overall_rating,
        draw_rating, burn_rating, construction_rating, flavor_rating,
        pairing_drink, pairing_food, location, occasion,
        smoke_duration_minutes, review_text, photo_urls,
        cigar:cigar_catalog(brand, series, name, format)
      `)
      .eq("id", raw.smoke_log_id as string)
      .single();
    smokeLog = (logData as SmokeLogData | null) ?? null;
  }

  const post = {
    id:          raw.id          as string,
    title:       raw.title       as string,
    content:     raw.content     as string,
    created_at:  raw.created_at  as string,
    updated_at:  raw.updated_at  as string,
    is_system:   raw.is_system   as boolean,
    is_locked:   raw.is_locked   as boolean,
    user_id:     postAuthorId,
    category_id: raw.category_id as string,
    category:    raw.forum_categories as { name: string; slug: string },
    author:      postAuthorId
      ? { display_name: nameMap[postAuthorId]?.display_name ?? null, avatar_url: nameMap[postAuthorId]?.avatar_url ?? null }
      : null,
    like_count:  likeCount,
    image_url:   (raw.image_url as string | null) ?? null,
  };

  const comments = commentRows.map((c) => ({
    ...c,
    profiles: { display_name: nameMap[c.user_id]?.display_name ?? null, avatar_url: nameMap[c.user_id]?.avatar_url ?? null },
  }));

  const hasLiked = (likeRes.count ?? 0) > 0;

  return (
    <PostDetailClient
      post={post}
      comments={comments}
      hasLiked={hasLiked}
      userId={user.id}
      smokeLog={smokeLog}
    />
  );
}
