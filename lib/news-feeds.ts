/*
 * Cigar-news RSS feed registry.
 *
 * Each entry powers /api/news/sync — that route fetches the feed,
 * parses it, and upserts items into news_items keyed by RSS guid.
 *
 * source_slug is stable per source and used in URLs / filters.
 * source_name is the display name shown in cards.
 *
 * Adding a feed: append here, redeploy, and the next cron run picks
 * it up. Removing a feed: drop the entry — existing news_items rows
 * stay (history) but no new items will arrive.
 */

export interface NewsFeed {
  slug: string;
  name: string;
  url:  string;
}

export const NEWS_FEEDS: readonly NewsFeed[] = [
  {
    slug: "halfwheel",
    name: "Halfwheel",
    url:  "https://halfwheel.com/feed/",
  },
  // jr-cigars is behind Imperva and serves a JS challenge to all
  // non-browser clients — re-enable if jrcigars.com whitelists our UA
  // or we move the fetch to a headless-browser fallback.
  {
    slug: "cigar-dojo",
    name: "Cigar Dojo",
    url:  "https://cigardojo.com/feed/",
  },
  {
    slug: "cigar-journal",
    name: "Cigar Journal",
    url:  "https://www.cigarjournal.com/feed/",
  },
  {
    slug: "kohnhed",
    name: "Kohnhed",
    url:  "https://kohnhed.com/feed/",
  },
  {
    slug: "smokin-tabacco",
    name: "Smokin Tabacco",
    url:  "https://smokintabacco.com/feed/",
  },
  {
    slug: "cigar-coop",
    name: "Cigar Coop",
    url:  "https://cigar-coop.com/feed",
  },
] as const;
