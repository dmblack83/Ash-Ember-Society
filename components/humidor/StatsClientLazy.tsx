"use client";

/* ------------------------------------------------------------------
   StatsClient — lazy wrapper.

   Reasons it's split out:
   - StatsClient imports recharts (~95KB gzipped). Recharts is heavy
     and only needed on /humidor/stats.
   - The bundle-baseline run on 2026-05-06 showed /humidor/stats at
     310KB analyze.data — recharts dominates that route's client JS.
   - With this wrapper, recharts code lives in its own async chunk
     loaded after the route's static shell paints. The /humidor/stats
     route's main chunk stays lean.

   ssr: false is intentional. recharts SSR-renders, but the route is
   auth-gated and force-dynamic — there's no SEO value in pre-rendering
   the charts, and skipping SSR avoids any chart-vs-window-size mismatch
   on hydration.
   ------------------------------------------------------------------ */

import dynamic                from "next/dynamic";
import type { StatsClientData } from "./StatsClient";

const StatsClient = dynamic(
  () => import("./StatsClient").then((m) => ({ default: m.StatsClient })),
  {
    ssr:     false,
    /* No skeleton — the page renders the totals + chart placeholders
       above this lazy boundary; this wrapper just defers chart code. */
    loading: () => null,
  },
);

export function StatsClientLazy({ data }: { data: StatsClientData }) {
  return <StatsClient data={data} />;
}
