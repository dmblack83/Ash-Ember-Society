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

  /* ── Account page full profile row (per-user; wider column set than
   *   `profile` — includes contact fields + Stripe linkage). Own-row
   *   RLS scoped, so the fetcher only ever sees the signed-in user. */
  accountProfile: (userId: string) => ["account-profile", userId] as const,

  /* ── Humidor (per-user collection). */
  humidorItems: (userId: string) => ["humidor-items", userId] as const,
  wishlist:     (userId: string) => ["wishlist",      userId] as const,
  /* Boolean "has ≥1 wishlist item" — drives the Humidor empty-state
     "add from wishlist" CTA. Separate key from `wishlist` (the full
     list) because it's a cheap HEAD count, not the rows. */
  hasWishlist:  (userId: string) => ["wishlist-has",  userId] as const,
  /* Burn-reports list bundle (reports + tags + byline) and the stats
     page's assembled chart data — both per-user. */
  burnReports:  (userId: string) => ["burn-reports",  userId] as const,
  humidorStats: (userId: string) => ["humidor-stats", userId] as const,
  /* Detail-page bundles — keyed by userId AND the row id so a user
     switch on a shared browser can't serve another user's cached
     bundle within the same JS session. */
  humidorItemBundle: (userId: string, itemId: string) =>
    ["humidor-item-bundle", userId, itemId] as const,
  burnReportCreate:  (userId: string, itemId: string) =>
    ["burn-report-create", userId, itemId] as const,
  burnReportEdit:    (userId: string, smokeLogId: string) =>
    ["burn-report-edit", userId, smokeLogId] as const,

  /* ── Lounge / forum. Liked status is per-user, so userId is part
   *   of the key — switching account on the same browser produces a
   *   fresh cache, not stale liked flags.
   *
   *   categoryId is null for the unified All feed ("all-categories"
   *   sentinel keeps the tuple shape stable). `filter` and `sort`
   *   partition the cache per secondary-row view so toggling chips
   *   or views hits independent cache entries. Stale keys persisted
   *   by the old per-room lounge are orphaned and harmless. */
  loungeFeed:   (
    categoryId: string | null,
    page:       number,
    userId:     string,
    filter:     "all" | "mine" | "open" | "closed" = "all",
    sort:       "new" | "hot" = "new",
  ) => ["lounge-feed", categoryId ?? "all-categories", page, userId, filter, sort] as const,
  loungeComments: (postId: string) => ["lounge-comments", postId] as const,
  /* Lounge static-shell bundle (categories + pinned posts + rules gate
   * + founder badge). Per-user: pinned enrichment carries the viewer's
   * liked/vote state, and the rules-gate flag is the viewer's own. */
  loungeShell: (userId: string) => ["lounge-shell", userId] as const,
  /* Post-detail bundle (post + comments + like state + smoke log) —
   * keyed by userId AND postId so a user switch on a shared browser
   * can't serve another user's cached hasLiked state. */
  postDetail: (userId: string, postId: string) =>
    ["post-detail", userId, postId] as const,
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
  /* Per-user "is this cigar on my wishlist" flag for the detail page. */
  cigarWishlisted: (userId: string, cigarId: string) =>
    ["cigar-wishlisted", userId, cigarId] as const,

  /* ── Home notifications card (per-user). Keyed by userId so
   *   switching account on the same browser produces a fresh cache,
   *   not another user's unseen counts. */
  notifications: (userId: string) => ["notifications", userId] as const,

  /* ── Home aging island (per-user). */
  homeAging:     (userId: string) => ["home-aging", userId] as const,

  /* ── Govee humidor sensor status (per-user; /api/govee/connection).
   *   Shared by the humidor strip, the home card, and the account
   *   section — one cache entry, one request. */
  goveeStatus:   (userId: string) => ["govee-status", userId] as const,

  /* ── Humidor containers (per-user; humidors table, own-row RLS).
   *   Shared by chips, conditions strips, sheets, and the home card. */
  humidors:      (userId: string) => ["humidors", userId] as const,

  /* ── Home news rail (public — shared across users). */
  newsLatest:    (limit: number) => ["news-latest", limit] as const,
  /* ── Industry News page (public, paginated via useSWRInfinite). */
  newsPage:      (pageIndex: number) => ["news-page", pageIndex] as const,
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
