# Reliability Dashboard

The single page you check when triaging a user-reported reliability issue or validating that a reliability fix moved the needle. Pairs with the [Reliability Working Agreement](../superpowers/specs/2026-06-03-reliability-working-agreement.md) and the [Instrumentation Pass spec](../superpowers/specs/2026-06-03-reliability-instrumentation-pass-design.md).

## How to use

Open a link below to drop directly into a pre-filtered Sentry Issues view. Each link is a Sentry deep-link with the query encoded in the URL — no Sentry saved-search needed.

If the deep-links rot (Sentry URL format changes, org renamed), the raw query strings are in the table — paste into Sentry's Issues search box manually as a fallback.

## Views

| View | Query | Deep link |
|---|---|---|
| Overview | `type:reliability` | [Open](https://ash-ember.sentry.io/issues/?query=type%3Areliability&project=4511341339082752) |
| SW lifecycle | `type:reliability bucket:sw_lifecycle` | [Open](https://ash-ember.sentry.io/issues/?query=type%3Areliability+bucket%3Asw_lifecycle&project=4511341339082752) |
| Auth / session | `type:reliability bucket:auth_session` | [Open](https://ash-ember.sentry.io/issues/?query=type%3Areliability+bucket%3Aauth_session&project=4511341339082752) |
| Network resilience | `type:reliability bucket:network_resilience` | [Open](https://ash-ember.sentry.io/issues/?query=type%3Areliability+bucket%3Anetwork_resilience&project=4511341339082752) |
| iOS WebKit | `type:reliability bucket:ios_webkit` | [Open](https://ash-ember.sentry.io/issues/?query=type%3Areliability+bucket%3Aios_webkit&project=4511341339082752) |
| State persistence | `type:reliability bucket:state_persistence` | [Open](https://ash-ember.sentry.io/issues/?query=type%3Areliability+bucket%3Astate_persistence&project=4511341339082752) |

Narrow further by appending a subtype, e.g. `type:reliability subtype:proxy_auth_timeout`.

## Bucket-subtype matrix

| Bucket | Subtypes wired today | Deferred (in union, not yet wired) |
|---|---|---|
| `sw_lifecycle` | `activate_fail`, `nav_cache_stale`, `update_banner_cycle` | `precache_fail` |
| `auth_session` | `jwt_verify_fail`, `proxy_auth_timeout`, `oauth_host_drift` | `cookie_domain_mismatch` |
| `network_resilience` | `body_too_large`, `outbox_replay_fail`, `chunk_load_error` | `fetch_timeout` |
| `ios_webkit` | `splash_fail`, `scope_violation`, `redirect_loop`, `hydration_watchdog_fired` | (none) |
| `state_persistence` | `draft_save_fail` | `optimistic_rollback`, `edit_dropped` |

Deferred subtypes are valid `ReliabilitySubtype` values in `lib/telemetry/reliability.ts`; they just have no call sites yet. The deferrals were intentional and documented in the original PR descriptions (#487, #488, #490).

## What a spike here usually means

These notes get rewritten once we've observed real shapes in production. Until then, treat them as starter guesses to refine.

- **`sw_lifecycle` spike:** most likely a deploy-related cache-invalidation issue. Cross-check timing against the most recent merge to `main`. Look at the `update_banner_cycle` vs `activate_fail` subtype mix: banner-cycle spikes correlate with new `SW_VERSION` per deploy; activate-fail spikes are iOS-specific and rare.
- **`auth_session` spike:** most likely a Supabase Auth incident OR a recent change to `proxy.ts` / cookie handling. `proxy_auth_timeout` rising specifically means Supabase Auth is slow; `jwt_verify_fail` rising means tokens are being rejected (signature, expiry, JWKS). `oauth_host_drift` rising means `NEXT_PUBLIC_SITE_URL` is unset or empty in Vercel env.
- **`network_resilience` spike:** `body_too_large` rising means client-side image compression isn't keeping uploads under 4.5 MB. `chunk_load_error` rising means a recent deploy left stale clients with bad chunk URLs. `outbox_replay_fail` rising during an incident means a downstream API is returning 4xx that shouldn't.
- **`ios_webkit` spike:** all four subtypes are inherently iOS-PWA-specific; a sudden spike likely correlates with an iOS Safari release or a manifest / scope / splash file change in the repo. `redirect_loop` is the most actionable — fix it like the bare/www work in PR #483.
- **`state_persistence` spike:** today only `draft_save_fail` is wired. Spike likely means either (a) iOS PWA users hitting localStorage quota / partition issues, or (b) a regression in the burn-report PATCH route causing many `cause:patch_http_*` events at once.

## Workflow when you see a spike

1. Open the relevant bucket view above.
2. Group by `subtype` (Sentry's "Group by" UI control).
3. Pick the subtype that's spiking. Note the `cause` distribution.
4. Form a hypothesis per Principle 2 of the working agreement.
5. Ship the fix as its own PR following Principles 3 + 4 (validated merge, kill-switch / revert path).

If the spike has no clear pattern, that's the signal that the current bucket's instrumentation is too coarse — file a follow-up to add a narrower subtype rather than guess-fixing.

## Deep-link maintenance

Deep-links above assume:
- Sentry org slug: `ash-ember`
- Project ID: `4511341339082752`

If either changes (rename, project move), regenerate this table. Format: `https://<org>.sentry.io/issues/?query=<URL-encoded query>&project=<project-id>`.
