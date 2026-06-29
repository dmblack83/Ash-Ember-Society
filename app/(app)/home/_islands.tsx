/*
 * Server island for the home dashboard: the public News rail. All user-data
 * islands moved client-side (client-islands.tsx) for the static-shell model;
 * News stays server-rendered (public, cached) inside its Suspense boundary.
 */

import { getLatestNews } from "@/lib/data/news";
import { News }          from "@/components/dashboard/News";

/* News rail (cached at the data layer via unstable_cache). */
export async function NewsIsland() {
  const items = await getLatestNews(5);
  return <News items={items} />;
}
