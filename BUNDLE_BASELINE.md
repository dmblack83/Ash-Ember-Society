# Bundle baseline — 2026-05-06

Reference snapshot of production bundle sizes. **Compare future runs against this** to measure the impact of perf work in `project_maintenance_plan.md` Section 5.

| Field | Value |
|---|---|
| **Date (UTC)** | 2026-05-06 06:16 |
| **Commit SHA** | `ae59808` (origin/main, post #294 Sentry) |
| **Build ID** | `sVxWI346NEYGpmYH2CDSi` |
| **Next.js** | 16.2.1 |
| **Bundler** | Turbopack |
| **Total `_next/static/chunks/`** | **1,548 KB** (raw, uncompressed) |

## Top chunks — uncompressed bytes

The interactive viewer (`npx next experimental-analyze` without `--output`) shows what's in each.

| Bytes | KB | Hash |
|---:|---:|---|
| 618,058 | **603 KB** | `64e504f815854219.js` |
| 410,979 | **401 KB** | `29df097d1082f81a.js` |
| 143,238 | 140 KB | `0dcb8fbb7c502475.js` |
| 112,594 | 110 KB | `a6dad97d9634a72d.js` |
| 47,447 | 46 KB | `b607dc4daafe934d.js` |
| 43,805 | 43 KB | `adecd0ef71a11c8f.css` |
| 26,850 | 26 KB | `14ceeeaa07f3cde1.js` |
| 18,251 | 18 KB | `turbopack-03041747c8de0c84.js` |

## Per-route analyze.data sizes — uncompressed bytes

Heavier routes ship more page-specific code. Below ~200 KB tracks framework + small page; above ~250 KB usually means a heavy library is statically imported.

| Bytes | Route | Notes |
|---:|---|---|
| 408,816 | `/account` | Heaviest — verify what's pulled in |
| 369,506 | `/login` | Surprisingly heavy for an auth page |
| 369,478 | `/signup` | Same as login (shared shell) |
| 367,570 | `/discover/content` | |
| 366,754 | `/onboarding` | |
| 351,371 | `/offline` | Static fallback shouldn't be this large |
| 349,948 | `/_not-found` | |
| 326,531 | `/_global-error` | Sentry error boundary added in #294 |
| 310,779 | `/humidor/stats` | Suspect: `recharts` (P5b lazy-load target) |
| 232,187 | `/lounge/rooms/[slug]` | |
| 229,550 | `/home` | Streaming islands keep this lean |
| 226,070 | `/lounge/[postId]` | |
| 225,277 | `/discover/channels` | |
| 224,420 | `/discover/partners` | |
| 221,875 | `/discover/cigars/[id]` | |
| 220,582 | `/humidor/[id]` | |
| 220,577 | `/humidor/[id]/burn-report` | |
| 220,568 | `/humidor` | |
| 220,186 | `/humidor/wishlist` | |
| 220,129 | `/discover/cigars` | |
| 219,340 | `/humidor/burn-reports` | |
| 219,271 | `/discover/shops/[slug]` | Suspect: `@react-google-maps/api` (P5c) |
| 216,740 | `/lounge` | |
| 216,528 | `/admin` | |
| 214,544 | `/discover/shops` | Same map dependency as `[slug]` |
| 214,281 | `/account/membership/success` | |
| 213,531 | `/discover/field-guide/vol-04` | All 4 volumes nearly identical — |
| 213,531 | `/discover/field-guide/vol-03` | suggests duplicated code that should |
| 213,531 | `/discover/field-guide/vol-02` | be moved into a shared component or |
| 213,351 | `/discover/field-guide/vol-01` | dynamic param route |
| 162,067 | `/instrumentation` | Sentry init |

## Initial observations

1. **Two giant chunks** dominate at 603 KB + 401 KB. Almost certainly include framer-motion, recharts, @react-google-maps/api, lucide-react, qrcode.react, canvas-confetti, and the Sentry SDK. Phase 2 PR B (lazy-load recharts, maps, qrcode.react) targets this directly.
2. **`/humidor/stats` is the lightest of the heavy routes** that doesn't use streaming. Recharts lazy-load (5b) should cut it noticeably.
3. **`/discover/shops` and `/discover/shops/[slug]`** are similar size — both pull in the maps API. Lazy-loading the `<GoogleMap>` block (5c) should help.
4. **Field guide volumes** are identical-size copies. Worth checking whether they share their component or duplicate it; collapsing into a single `[vol]/page.tsx` route is a small refactor.
5. **`/login` / `/signup` at ~370 KB** — auth pages ship a lot. Maybe inheriting marketing-style imports? Worth a closer look.
6. **`/offline` at 351 KB** is high for what should be a static fallback. It's `force-static` per the route segment config but somehow pulls in heavy code. Investigate.

## How to regenerate this baseline

```
git checkout main
git pull
npm install
vercel env pull --environment=preview
npx next build
npx next experimental-analyze --output
```

Then compute new totals from `.next/diagnostics/analyze/`. Compare against this file by SHA.

For interactive exploration:
```
npx next experimental-analyze
```
Open the printed URL (default port 4000) — treemap viewer shows what's in each chunk.

## Caveats

- **Sizes here are uncompressed.** Real wire weight is gzip/brotli (typically 25–35% of these numbers). Compression ratios vary by content; the relative ranking is what matters for delta tracking.
- **Per-route `analyze.data` is NOT the JS the user downloads** for that route. It's the analyzer's internal data file. Use the chunk listing above + the interactive viewer for actual route-level shipped JS.
- **Hashes change on every build** even with no source changes (build IDs differ). Compare by route name and total size, not by hash.
