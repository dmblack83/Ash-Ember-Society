import { PostDetailSkeleton } from "./_skeletons";

/*
 * Lounge post-detail prefetch skeleton. Renders during client-side
 * route prefetch before the page tree mounts. Same shape as the
 * in-page <Suspense> fallback in page.tsx so the swap between
 * prefetch → Suspense → real content doesn't shift the layout.
 */
export default function PostDetailLoading() {
  return <PostDetailSkeleton />;
}
