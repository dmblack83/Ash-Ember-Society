# Bundle baseline — 2026-05-27

Reference snapshot of production bundle sizes. **Compare future runs against this** to measure the impact of perf work.

| Field | Value |
|---|---|
| **Date (UTC)** | 2026-05-27 |
| **Commit SHA** | `d4a075c` (origin/main, post #455 membership simplification) |
| **Build ID** | `KlXTVIMkcAHW6NNauBAp5` |
| **Next.js** | 16.2.1 |
| **Bundler** | Turbopack |
| **Total `_next/static/chunks/`** | **2,960 KB** (raw, uncompressed) across 61 JS chunks + 1 CSS |

## Delta vs prior baseline (2026-05-06, `ae59808`)

| Metric | Old | New | Delta |
|---|---:|---:|---|
| Total chunks size | 1,548 KB | 2,960 KB | +91% (more granular splitting, not more code) |
| Top chunk | 603 KB | 426 KB | **-29%** (server-bundle fix #447) |
| #2 chunk | 401 KB | 373 KB | -7% |
| JS chunk count | ~8 large | 61 | finer split, better caching |
| /humidor/stats | 310 KB | 282 KB | **-9%** (recharts lazy-load PR) |
| /account | 408 KB | 390 KB | -4% |
| /login | 369 KB | 379 KB | +3% |
| /home | 229 KB | 232 KB | flat |
| /lounge/rooms/[slug] | 232 KB | 235 KB | flat |

**Takeaway:** top-chunk and per-route sizes are flat-to-down. The 91% total growth is Next 16 / Turbopack splitting code into more parallel-downloadable chunks, not new code shipped. Per-route is the metric to track, not the chunks total.

## Top chunks — uncompressed bytes

| Bytes | KB | Hash |
|---:|---:|---|
| 426,297 | **416 KB** | `07d6kfvgm2.5a.js` |
| 372,604 | **364 KB** | `0qreffq3yfxpv.js` |
| 202,775 | 198 KB | `07qlcl.ihv7bf.js` |
| 146,504 | 143 KB | `0j3la.8nw.5jm.js` |
| 123,403 | 121 KB | `0bj4y_j044rqd.js` |
| 112,663 | 110 KB | `08yc~on6-l9ex.js` |
| 112,594 | 110 KB | `03~yq9q893hmn.js` |
| 96,625 | 94 KB | `0lcgnj24d5..j.js` |
| 76,923 | 75 KB | `0f9adwxk6k3g~.js` |
| 63,779 | 62 KB | `0~2-idvcvjucw.js` |
| 57,854 | 56 KB | `05fq1cv4i2753.css` (only CSS chunk) |
| 57,241 | 56 KB | `0w9rz.a6sy4dx.js` |

## Per-route analyze.data sizes — uncompressed bytes

App routes only (API and infrastructure excluded). Below ~200 KB tracks framework + small page; above ~250 KB usually means a heavy library is statically imported.

| Bytes | Route | Notes |
|---:|---|---|
| 390,490 | `/account` | Heaviest app route, still the audit target |
| 379,248 | `/login` | Auth page heavier than expected |
| 376,501 | `/discover/content` | |
| 376,480 | `/signup` | Shares shell with login |
| 376,378 | `/signup/verify` | New since prior baseline |
| 375,694 | `/discover/vendors` | Placeholder route still ships heavy shell |
| 375,361 | `/onboarding` | |
| 359,027 | `/privacy` | **New since prior baseline. Public legal page is 359 KB.** |
| 359,023 | `/terms` | Same as privacy |
| 359,011 | `/eula` | Same |
| 357,896 | `/offline` | Static fallback still 358 KB, pulls (app) layout |
| 282,246 | `/humidor/stats` | recharts lazy-load shaved 28 KB |
| 268,837 | `/` | Landing (unauthenticated entry) |
| 235,361 | `/lounge/rooms/[slug]` | |
| 232,431 | `/home` | Streaming islands keep this lean |
| 229,204 | `/lounge/[postId]` | |
| 228,197 | `/discover/channels` | |
| 226,932 | `/discover/cigar-news` | |
| 225,675 | `/admin` | |
| 224,798 | `/discover/cigars/[id]` | |
| 224,492 | `/humidor` | |
| 224,190 | `/humidor/[id]` | |
| 223,680 | `/humidor/burn-reports/[id]/edit` | New since prior baseline |
| 223,323 | `/humidor/[id]/burn-report` | |
| 223,131 | `/humidor/wishlist` | |
| 222,794 | `/discover/cigars` | |
| 222,533 | `/humidor/burn-reports` | |
| 219,628 | `/lounge` | |
| 216,721 | `/account/membership/success` | |
| 215,953 | `/discover/field-guide/vol-04` | 4 identical-size copies, |
| 215,953 | `/discover/field-guide/vol-03` | each ~216 KB, confirms |
| 215,953 | `/discover/field-guide/vol-02` | duplication, candidate for |
| 215,757 | `/discover/field-guide/vol-01` | single `[vol]/page.tsx` route |

## Observations

1. **Server-bundle fix #447 worked.** Top chunk dropped 29%, gRPC/Vision stack no longer shared.
2. **recharts lazy-load worked.** `/humidor/stats` -9% (-28 KB).
3. **Public legal pages are 359 KB each.** `/privacy`, `/terms`, `/eula` are unauthenticated static routes but still ship the full (app)-layout shell. Worth checking, should they live outside `(app)` group?
4. **`/offline` is still 358 KB.** Pulls (app) layout including the auth-gated chrome. Could be moved to its own minimal route.
5. **Field guide volumes are identical-size duplicates.** Collapsing `vol-01..04` into `[vol]/page.tsx` is a small refactor with measurable bundle win.
6. **`/discover/vendors` is a placeholder route shipping 376 KB.** Either ship the real feature or stub with a minimal shell.

## How to regenerate this baseline

```
git checkout main
git pull
npm install
cp ~/.env.local .env.local
npx next build
npx next experimental-analyze --output
```

Then compute new totals from `.next/diagnostics/analyze/`. Compare against this file by SHA.

For interactive exploration:
```
npx next experimental-analyze
```
Open the printed URL (default port 4000), treemap viewer shows what's in each chunk.

## Caveats

- **Sizes here are uncompressed.** Real wire weight is gzip/brotli (typically 25-35% of these numbers). Compression ratios vary by content; the relative ranking is what matters for delta tracking.
- **Per-route `analyze.data` is NOT the JS the user downloads** for that route. It's the analyzer's internal data file. Use the chunk listing above + the interactive viewer for actual route-level shipped JS.
- **Hashes change on every build** even with no source changes (build IDs differ). Compare by route name and total size, not by hash.
- **The 91% total chunks growth is benign.** Next 16 + Turbopack split code more granularly, which improves cache reuse and parallel download. Per-route bundle size is the right metric for tracking deltas.
