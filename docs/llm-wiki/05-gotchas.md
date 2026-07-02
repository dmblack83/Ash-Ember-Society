# Gotchas — hard-won landmines

> TL;DR for agents: every entry here cost real debugging time. Check this list BEFORE
> forming hypotheses about a bug and BEFORE proposing an architecture change. If your
> plan contradicts an entry here, the plan is wrong until proven otherwise.

## Auth / server-side

- **`auth.uid()` returns NULL in RSC under this app's proxy.** Per-user RLS/RPC reads
  scoped by `auth.uid()` return `[]` when executed server-side. Pass `userId` explicitly
  (from `getServerUser()`) or fetch client-side. Do not "fix" this by weakening RLS.
- **`profiles` is own-row RLS.** Client-side reads of OTHER users' rows return 0 rows
  silently (no error). Cross-user name/avatar/badge reads go through the
  `public_profiles` view, never `profiles`.
- **`supabase.auth.getUser()` can hang** (17-31s hangs observed in prod). The proxy's
  hot path is local jose JWKS verification — zero auth network calls; a 3s-raced
  `getSession()` refresh runs only for expired tokens. Do not add blocking
  `getUser()`/network auth calls to the request path.

## Supabase / Postgres

- **Migration drift is the #1 recurring production incident.** SQL migrations are run
  manually in the Supabase SQL editor; a file existing in the repo does NOT mean it ran
  in prod. Two real incidents: a missing `assigned_badges` column silently nulled all
  profile queries; a `_lounge_read` policy was missed. When shipping SQL: paste the
  exact SQL in chat as a copy-paste block WITH a verify query, and flag it as a
  pre-deploy gate.
- **Generated columns need IMMUTABLE expressions.** `concat_ws`/`concat` are STABLE and
  rejected in `GENERATED ... STORED`. Use `||` with `coalesce`.
- **burn_reports vs smoke_logs are separate concepts.** Burn-report-only fields go on
  `burn_reports` (1:1 FK to `smoke_logs`). Do not add them to `smoke_logs`.
- **Forum counts are NOT an N+1.** PostgREST nested aggregation is a single query.
  This was investigated and confirmed 2026-05-06; do not re-flag or "fix" it.

## iOS PWA (largest cluster of past incidents)

- **Vercel 4.5 MB function body cap surfaces as a Safari TLS error.** Multipart POST
  over the cap → `FUNCTION_PAYLOAD_TOO_LARGE` at the edge; iOS PWA shows "TLS error",
  `Status: —`, and ZERO Vercel function logs. Client-side compression via
  `lib/image-compress.ts` is the fix pattern. General heuristic: no function-layer
  logs + no response status = the request died at the edge, upstream of app code.
- **iOS splash is device-independent by design** (one centered logo in the cold-smoke
  overlay). Do NOT reintroduce per-device `apple-touch-startup-image` matching.
- **Host redirects break iOS PWA startup.** ashember.vip 307s to www; iOS won't follow
  redirects for startup images. Host-conditional redirect lives in `next.config.ts`;
  the PWA must be added from www.
- **Web Share API:** `canShare` returns false on iOS PWA < 16.4; prefetch share payloads
  on mount; the document icon in the share sheet is expected, not a bug.
- **Text inputs need `font-size: 16px`** or iOS auto-zooms the viewport.

## Service worker / PWA shell

- **Any auth-gated file referenced from `public/` silently hangs SW install.** The CI
  job `sw-precache-check` exists to block this class. If SW install hangs, check the
  precache manifest first.
- **Cold-launch root cause was auth-on-first-paint, not the network stack.** The fix is
  the app-shell + client-auth pattern (`resolveSessionGate`). Network-first SW
  navigation was tried and REVERTED (#525) — do not re-propose it.
- **SW update banner:** pass build-stable `SW_VERSION` with `SW_UPDATED`; the banner
  dedupes via localStorage on dismiss. Without this, iOS shows a banner loop.
- **ResumeHandler:** `router.refresh()` on every resume caused a 5-10s frozen-UI hang
  on every app return. It is gated to once per 5 minutes. Don't add per-resume work.

## Next.js / build

- **This Next.js version has breaking changes vs training data.** Read
  `node_modules/next/dist/docs/` before writing Next.js-API code. Heed deprecations.
- **CSP: hash-based enforcement broke prod** ("Connection closed", reverted #332).
  RSC Flight payloads are per-request inline scripts; only nonce-based CSP can work.
  Currently not enforced. Do not re-attempt hash-based.
- **Server-tainted modules:** importing a helper from a module that also imports
  `next/headers` into a client component fails the build — even if some existing file
  appears to get away with it. Split the module; precedent is not permission.
- **Heavy server deps belong in `serverExternalPackages`** (`next.config.ts`). The
  gRPC/Vision stack once added 3.12 MB to the shared server chunk.

## Tooling / process traps

- **Stacked PRs + squash-merge can "ghost merge".** GitHub shows Merged but the commits
  never reached main. Verify with `git show origin/main:<path>`, not the PR badge.
- **Local `main` starts stale in this sandbox** (sometimes 50+ commits behind). Always
  `git fetch origin main` + ff-merge before branching (see 06-workflows.md).
- **`analyze.data` per-route figures are diagnostic, not shipped bytes.** Compare the
  same route across builds only; never route-to-route.
- **Chrome-extension scripted scrolling + `scroll-behavior: smooth`** produces phantom
  scroll drift in screenshots. Instrument in-page before debugging the page.
