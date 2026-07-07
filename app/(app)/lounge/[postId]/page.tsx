import { PostDetailRoute } from "./PostDetailRoute";

/*
 * Lounge post detail — client shell (same pattern as /humidor/[id]).
 * The post, comments, like state, and smoke-log bundle that used to
 * render server-side in a data island now load client-side in
 * lib/data/post-detail-fetchers.ts under the viewer's RLS. The route
 * stays dynamic (path param) but the document carries no data and no
 * auth work, so tapping a post paints the skeleton instantly.
 */

interface Props {
  params: Promise<{ postId: string }>;
}

export default async function PostDetailPage({ params }: Props) {
  const { postId } = await params;
  return <PostDetailRoute postId={postId} />;
}
