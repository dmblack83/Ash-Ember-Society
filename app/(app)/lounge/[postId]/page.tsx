import { createClient }      from "@/utils/supabase/server";
import { redirect }          from "next/navigation";
import { PostDetailClient }  from "@/components/lounge/PostDetailClient";

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
        profiles(display_name),
        forum_post_likes(count),
        forum_categories(name, slug)
      `)
      .eq("id", postId)
      .single(),
    supabase
      .from("forum_comments")
      .select("id, content, created_at, updated_at, user_id, parent_comment_id, profiles(display_name)")
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

  const post = {
    id:          raw.id          as string,
    title:       raw.title       as string,
    content:     raw.content     as string,
    created_at:  raw.created_at  as string,
    updated_at:  raw.updated_at  as string,
    is_system:   raw.is_system   as boolean,
    is_locked:   raw.is_locked   as boolean,
    user_id:     raw.user_id     as string | null,
    category_id: raw.category_id as string,
    category:    raw.forum_categories as { name: string; slug: string },
    author:      raw.profiles    as { display_name: string | null } | null,
    like_count:  likeCount,
  };

  const comments = ((commentsRes.data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as any;
    return {
      id:                r.id                as string,
      content:           r.content           as string,
      created_at:        r.created_at        as string,
      updated_at:        r.updated_at        as string,
      user_id:           r.user_id           as string,
      parent_comment_id: r.parent_comment_id as string | null,
      profiles:          Array.isArray(r.profiles)
        ? (r.profiles[0] as { display_name: string | null } | undefined) ?? null
        : (r.profiles as { display_name: string | null } | null),
    };
  });

  const hasLiked = (likeRes.count ?? 0) > 0;

  return (
    <PostDetailClient
      post={post}
      comments={comments}
      hasLiked={hasLiked}
      userId={user.id}
    />
  );
}
