/*
 * SWR cache-key conventions.
 *
 * Every client-side fetch goes through SWR (`useSWR(key, fetcher)`).
 * Keys MUST be tuples — first element is the resource family, the
 * rest are arguments. Keep them stable: identical args produce
 * identical keys, identical keys share one cache entry.
 *
 *   ✓ ["humidor-items", userId]
 *   ✓ ["lounge-feed", categoryId, page]
 *   ✗ `humidor-items-${userId}`         (string keys complicate diffing)
 *   ✗ ["humidor-items", { id: userId }] (new object every render = new key)
 *
 * Mutation hooks call `mutate(key)` with the same tuple to
 * invalidate. The `keyFor.*` builders below exist so the family
 * label is centralised — rename the family in one place if you
 * ever need to.
 */

export const keyFor = {
  /* ── User profile (already cached server-side via React.cache;
   *   this key is for the client SWR mirror so subsequent navigations
   *   render instantly while a background revalidation runs). */
  profile: (userId: string) => ["profile", userId] as const,

  /* ── Humidor (per-user collection). */
  humidorItems: (userId: string) => ["humidor-items", userId] as const,
  humidorItem:  (itemId: string) => ["humidor-item",  itemId] as const,
  wishlist:     (userId: string) => ["wishlist",      userId] as const,

  /* ── Lounge / forum. Liked status is per-user, so userId is part
   *   of the key — switching account on the same browser produces a
   *   fresh cache, not stale liked flags.
   *
   *   `filter` partitions the cache between "all posts" and "my posts
   *   only" so toggling the segmented control in CategoryFeed hits a
   *   different cache entry instead of refetching the same data into
   *   the same key. Both views are independently paginated. */
  loungeFeed:   (
    categoryId: string,
    page:       number,
    userId:     string,
    filter:     "all" | "mine" = "all",
  ) => ["lounge-feed", categoryId, page, userId, filter] as const,
  loungePost:   (postId: string) => ["lounge-post", postId] as const,
  loungeComments: (postId: string) => ["lounge-comments", postId] as const,
  /* Feedback category list — separate from `loungeFeed` because the
   * vote tallies and the hidden-by-default expand UX have a different
   * shape. Keyed per-user so vote state caches correctly. */
  feedbackPosts: (categoryId: string, userId: string) =>
    ["feedback-posts", categoryId, userId] as const,

  /* ── Cigar catalog (largely public — backed by the existing
   *   server-side React.cache + 60s revalidate on /discover/cigars).
   *   cigarSearch is paginated; key includes page index so different
   *   queries get separate cache trees. Empty query is a valid value
   *   (treated as "popular cigars" sort). */
  cigar:        (cigarId: string) => ["cigar", cigarId] as const,
  cigarSearch:  (query: string, page: number) =>
    ["cigar-search", query, page] as const,

  /* ── Shops directory (public). */
  shop:         (slug: string) => ["shop", slug] as const,
} as const;

/*
 * Generic JSON fetcher for fetch-based reads (e.g. our own /api routes).
 * For Supabase reads, prefer a typed function that returns the row(s)
 * directly — pass that as the second arg to useSWR.
 */
export const jsonFetcher = async <T>(input: RequestInfo | URL): Promise<T> => {
  const res = await fetch(input);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};
