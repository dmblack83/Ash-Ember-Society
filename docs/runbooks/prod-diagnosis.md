# Prod diagnosis runbook — where to look before hypothesizing

Repo-specific evidence map for production issues. Use WITH
superpowers:systematic-debugging (this tells you which evidence surfaces
exist; that tells you how to reason). History shows chronic symptoms here
took 6-10 guess-fix PRs when sessions skipped straight to hypotheses; one
round of the right evidence usually ends it.

## First moves by symptom

| Symptom | Look here first |
|---|---|
| Blank/white screen on launch | Performance marks `ae:chunk-load-error`, `ae:watchdog-fired`, `ae:hydrated` (User Timing; PRs #288-290). Which mark fired identifies the path; none firing = fourth cause, instrument it. |
| Frozen on resume/return | ResumeHandler gating (5-min rule, PR #504); iOS repaint nudge in BottomNav; `ae:*` marks. |
| Slow first-open of the day | Known cold-transport stall, NOT app code (Sentry `cold_transport_slow` probe, #510). Server is <10ms; do not optimize server code for this. |
| Nav taps dead on cold load | Static-shell regression: `npm run check:shells` after a build; check nav `prefetch` vs route dynamics (PR #557 class). |
| Push notifications broken | `push_send_log` + `push_outbox` tables (query via SQL editor or REST); SW install state; precache gate CI job (#473 class: any auth-gated precache URL hangs install silently). |
| Cron jobs not running | `cron_run_log` table: name, ok, error, duration_ms. |
| Data missing / feature silently empty | RLS or schema drift: probe with anon REST (below); diff `supabase/prod-schema-snapshot.txt` against a fresh introspection export (query in docs/db-drift-audit-2026-07-07.md). Remember `auth.uid()` is null in RSC under the proxy — per-user reads need explicit userId or client-side fetch. |
| Burn-report numbers/hot feed wrong | RPC health: `get_report_numbers` / `get_hot_posts` — log markers `burn-report-number` and `lounge-hot-fallback` in Vercel logs mean the RPC is missing/failing and JS fallback is active. |
| Upload fails on iOS as TLS error | Vercel 4.5 MB body cap (FUNCTION_PAYLOAD_TOO_LARGE) — check payload size before anything else (`lib/image-compress.ts`). |
| Stale UI after deploy | SW caches: `navigations` cache (auth-partitioned SWR), stale-chunk recovery marks; SW_UPDATED banner dedupe. |

## Evidence surfaces

- **Vercel runtime logs** (MCP `get_runtime_logs`, project `the-humidor`,
  team `dmblack83-gmailcoms-projects`): retention is SHORT (~1 day) — pull
  logs the moment a symptom is reported. `group_by: requestPath` for shape,
  `query:` for the log markers above.
- **REST probes with the anon key** (from `.env.local`): definitive for
  schema/RLS questions without dashboard access.
  `curl "$URL/rest/v1/<table>?select=<cols>&limit=0"` — 200 = columns exist
  (RLS-independent); rows returned = anon-readable. RPCs:
  `POST /rest/v1/rpc/<fn>` with real args ONLY (empty args false-404s on
  functions with parameters).
- **Vercel Speed Insights**: real-user LCP/INP/CLS — check after any change
  flagged as perf-relevant.
- **Sentry**: currently CSP-only visibility; do not expect app errors there.
- **Runtime verification**: `.claude/skills/verify-in-app` — logged-in
  screenshots + console/5xx checks per route.
- **Diagnostic history**: memory files under the project workspace index the
  root causes already found (splash/www redirect, precache gate, proxy auth
  lock, cold transport, resume refresh, shell prefetch). Check whether the
  symptom matches a KNOWN cause before instrumenting a new one.

## Hard rules (earned the hard way)

1. After 3 failed fixes on the same symptom: ship instrumentation, not fix #4.
2. Absence of evidence at a layer locates the failure UPSTREAM of that layer
   (empty function logs = the request never reached the app).
3. A "Merged" badge is not deployment: verify `git show origin/main:<path>`.
4. SQL-editor exports drop rows silently: probe-verify any absence before
   acting on it.
