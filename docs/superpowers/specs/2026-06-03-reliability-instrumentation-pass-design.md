# Reliability Instrumentation Pass — Design

Step 1 of the [Reliability Working Agreement](./2026-06-03-reliability-working-agreement.md) build order. Wires structured Sentry events for the five reliability buckets so the next investigation pass has rate-and-trend data instead of anecdote.

## Goal

A single dashboard answers "is this bucket's failure rate moving?" within 24h of any reliability PR. No fix ships in this pass — only the visibility that makes future fixes accountable.

## Non-goals

- Fixing the underlying bugs the events surface (those flow through Step 4 of the agreement).
- Sentry Replay / Feedback integrations (deliberately off; see `instrumentation-client.ts`).
- Performance budgets / Core Web Vitals alerts (Speed Insights already covers this).
- Per-user identifiers in event payloads.
- Sentry Metrics product (paid; not justified at current scale; revisit if rate charts become load-bearing).

## Architecture

### Helper module

A new `lib/telemetry/reliability.ts` exports a single `trackReliability` function with a TypeScript discriminated union for bucket + subtype. Call sites stay one-liners; schema drift is caught by `tsc`. Mirrors the existing CSP listener in `instrumentation-client.ts`.

```ts
import * as Sentry from "@sentry/nextjs";

type Bucket =
  | "sw_lifecycle"
  | "auth_session"
  | "network_resilience"
  | "ios_webkit"
  | "state_persistence";

type Subtype =
  // sw_lifecycle
  | "activate_fail" | "precache_fail" | "nav_cache_stale" | "update_banner_cycle"
  // auth_session
  | "jwt_verify_fail" | "proxy_auth_timeout" | "cookie_domain_mismatch" | "oauth_host_drift"
  // network_resilience
  | "body_too_large" | "outbox_replay_fail" | "fetch_timeout" | "chunk_load_error"
  // ios_webkit
  | "splash_fail" | "scope_violation" | "redirect_loop" | "hydration_watchdog_fired"
  // state_persistence
  | "draft_save_fail" | "optimistic_rollback" | "edit_dropped";

interface ReliabilityEvent {
  bucket: Bucket;
  subtype: Subtype;
  cause?: string;   // short identifier, e.g. "precache_404"
  detail?: string;  // <=200 chars, non-PII narrative
  extra?: Record<string, string | number | boolean>;
}

export function trackReliability(e: ReliabilityEvent): void {
  Sentry.captureMessage(`reliability:${e.bucket}.${e.subtype}`, {
    level: "warning",
    tags: {
      type: "reliability",
      bucket: e.bucket,
      subtype: e.subtype,
      cause: e.cause ?? "unknown",
    },
    extra: { detail: e.detail?.slice(0, 200), ...e.extra },
  });
}
```

The Subtype union is the single source of truth for what's instrumented. Adding a subtype requires both the union edit and the call site — drift is impossible.

### Signal shape

- **Signal type:** `Sentry.captureMessage` (free; matches existing CSP listener; no Sentry plan upgrade needed).
- **Verbosity:** Failures + unusual transitions only. Successful happy-path events stay silent. Keeps Sentry quota usage low and dashboards readable.
- **Naming:** Tag-based; message string is `reliability:{bucket}.{subtype}` (doubles as Sentry fingerprint and human-readable label).
- **PII:** No user identifiers in event payloads. `sendDefaultPii: true` stays for unhandled errors (existing behavior); reliability events themselves carry only bucket / subtype / cause / non-identifying detail. Sentry's PII scrubber handles edge cases.
- **Console visibility:** None. `Sentry.captureMessage` is a silent background network call. Users do not see anything in DevTools.

## Instrumentation sites

One small PR per bucket. Each PR adds 2-5 `trackReliability(...)` calls plus a preview-deploy validation step in the PR description.

### Bucket 1 — `sw_lifecycle` (`app/sw.ts`)

| Subtype | Where | What |
|---|---|---|
| `activate_fail` | activate handler `catch` block | Currently silent. Add the call. |
| `precache_fail` | Serwist precache install `catch` | Bug class fixed by PR #473. |
| `nav_cache_stale` | navigation fetch handler when cache hit returns `redirected: true` | The suspected iOS PWA redirect-loop bucket. |
| `update_banner_cycle` | SW update banner dedupe (PR #480) | Fire when the dedupe key matches the just-dismissed version. |

### Bucket 2 — `auth_session` (`proxy.ts`, `lib/auth/*`, `app/actions/auth.ts`)

| Subtype | Where | What |
|---|---|---|
| `jwt_verify_fail` | jose JWKS verify rejection in `proxy.ts` (PR #444 path) | Currently logs to console only. |
| `proxy_auth_timeout` | the 3s `getUser()` race timeout (PR #290 path) | Currently `console.warn` only; route to telemetry too. |
| `cookie_domain_mismatch` | proxy: cookie scoped to bare host vs www | Detected by parsing `req.headers.cookie` vs `req.headers.host`. |
| `oauth_host_drift` | `app/actions/auth.ts` when `siteUrl` `||` fallback path triggers (PR #483) | Confirms when env var was empty in prod. |

### Bucket 3 — `network_resilience` (client fetch wrappers + `<head>` inline scripts)

| Subtype | Where | What |
|---|---|---|
| `body_too_large` | `lib/image-compress.ts` 413 detection (PR #474) | Currently swallowed by the compress retry. |
| `outbox_replay_fail` | offline outbox replay `catch` | Currently silent. |
| `chunk_load_error` | inline `<head>` script from PR #288, before cache-bust reload | Counts post-deploy stale-chunk pain. |
| `fetch_timeout` | any client-side `Promise.race` timeout | Reuses the PR #290 proxy pattern. |

### Bucket 4 — `ios_webkit` (`<head>` scripts + manifest scope runtime check)

| Subtype | Where | What |
|---|---|---|
| `hydration_watchdog_fired` | the 15s watchdog from PR #289 | Currently only sets a perf mark; also fire telemetry. |
| `redirect_loop` | counter in SW navigation handler: >2 same-document redirects in 5s | New detection; complements the bare-host fix in PR #483. |
| `splash_fail` | `onerror` on the splash image | Currently silent. |
| `scope_violation` | once-per-session runtime check: `location.host` vs manifest `scope` host | Fires once if the PWA is bouncing into an in-app browser at a wrong scope. |

### Bucket 5 — `state_persistence` (burn-report save paths + optimistic update wrappers)

| Subtype | Where | What |
|---|---|---|
| `draft_save_fail` | burn-report autosave rejection branches | Bug class fixed by PR #481. |
| `optimistic_rollback` | SWR `onError` rollbacks across all mutations | Currently swallowed. |
| `edit_dropped` | "save returned OK but data did not change" branch | The PATCH-thirds bug class from PR #481. |

**Total:** 19 call sites across 5 PRs, each PR <100 LOC.

## Dashboard

Six Sentry saved searches plus one in-repo documentation file.

### Saved searches

All filter `tags[type]:reliability` and use Sentry's built-in "Events over time" chart, 7-day window, grouped by `subtype`.

| Name | Query |
|---|---|
| Reliability — overview | `tags[type]:reliability` |
| Reliability — SW | `tags[type]:reliability tags[bucket]:sw_lifecycle` |
| Reliability — Auth | `tags[type]:reliability tags[bucket]:auth_session` |
| Reliability — Network | `tags[type]:reliability tags[bucket]:network_resilience` |
| Reliability — iOS WebKit | `tags[type]:reliability tags[bucket]:ios_webkit` |
| Reliability — State | `tags[type]:reliability tags[bucket]:state_persistence` |

### Documentation artifact

`docs/reliability/dashboard.md` checked into the repo with:
- The six saved-search URLs.
- The bucket-subtype matrix (copy of the tables above).
- One paragraph per bucket on "what a spike here usually means" — written after the first week of real data so the prose reflects observed shapes, not guesses.

In-repo for two reasons: (1) URLs survive Sentry org/project renames; (2) doubles as a README for future contributors.

## Validation per bucket PR

Each PR follows Principle 3 (Validated merges) of the working agreement. PR description template:

```
**Root cause:** N/A — instrumentation, not a fix.
**Evidence:** Recent PRs in this bucket: #<list>. Symptoms went uninstrumented.
**Why this addresses X:** Adds <N> tagged events at the named call sites; <bucket> view in Sentry now populates.
**Validation:** Events confirmed firing on the preview deploy by triggering each subtype (see steps below).
**Revert:** Single commit revert. No runtime behavior change beyond the Sentry network call.
```

### Trigger matrix

| Bucket | Preview-deploy trigger |
|---|---|
| `sw_lifecycle` | Gate a `public/` file behind auth on the preview branch temporarily; reload PWA; confirm `precache_fail` lands. |
| `auth_session` | Hit `/api/whoami` with a mangled JWT cookie via curl; confirm `jwt_verify_fail`. |
| `network_resilience` | Upload a >5MB photo via burn report; confirm `body_too_large`. |
| `ios_webkit` | Add a 20s artificial main-thread blocker on a throwaway preview-only branch (NOT shipping); confirm `hydration_watchdog_fired`. |
| `state_persistence` | Disconnect network mid-save in burn report; confirm `draft_save_fail`. |

For invasive triggers (`sw_lifecycle`, `ios_webkit`), the floor is "code review confirms the call path is reachable." Real fire observed in the first 24h post-merge by checking the dashboard.

## Production-safe rollout

Per Principle 4 of the agreement:

- **Kill-switch:** Telemetry itself is the kill-switch. Removing `NEXT_PUBLIC_SENTRY_DSN` in Vercel env stops all events immediately. No new flag needed.
- **Rolling release:** Not required — these PRs add only outbound Sentry network calls; failure mode is "the event doesn't send," which has zero user impact.
- **Revert plan:** Each PR is a single commit; `git revert <sha>` removes the calls. No DB migration, no env-var change.

## Build order

Pacing estimated in sessions (~2h each).

1. **PR A — Helper module + first bucket** (~1 session): `lib/telemetry/reliability.ts` plus `sw_lifecycle` call sites. Lands the helper at the same time as the first consumer so the import surface is real.
2. **PR B — `auth_session`** (~30 min).
3. **PR C — `network_resilience`** (~30 min).
4. **PR D — `ios_webkit`** (~30 min).
5. **PR E — `state_persistence`** (~30 min).
6. **Sentry saved-search creation** (~15 min, in Sentry UI, not a PR): after PR E has shipped at least 24h of real data, create the six saved searches listed above by hand in the Sentry dashboard. Copy the resulting URLs for the next step.
7. **PR F — Dashboard doc** (~30 min): `docs/reliability/dashboard.md` referencing the saved-search URLs from the previous step.

After PR F, Step 1 of the working agreement is complete. Step 2 (dashboard) is collapsed into PR F + the Sentry-UI step above, since the actual "dashboard" is just the six saved searches plus the in-repo doc that references them. The original working-agreement estimate of "~1 session for the dashboard" was over-padded.

## Open questions

- **Sentry quota headroom:** Current Sentry plan and monthly event budget are not documented in the repo. Before PR A merges, confirm in Sentry's settings that the expected reliability event volume (rough order-of-magnitude: dozens per day under normal conditions, low hundreds during an active incident) fits within the current plan's monthly quota. If not, switch the noisier subtypes (`nav_cache_stale`, `chunk_load_error`, `optimistic_rollback`) to a sampled rate via `Sentry.captureMessage`'s `level: "info"` + `tracesSampler` config, or move them behind a feature flag.

## Relationship to existing skills and patterns

- **systematic-debugging skill:** This pass is the precondition for that skill's Phase 1 — without instrumentation, hypothesis-forming has no evidence to point at.
- **verification-before-completion skill:** The "trigger matrix" section is the explicit verification step for this pass.
- **Existing CSP listener (`instrumentation-client.ts`):** Pattern donor. The reliability helper's tag shape mirrors it intentionally so dashboards can be queried with the same idiom.
