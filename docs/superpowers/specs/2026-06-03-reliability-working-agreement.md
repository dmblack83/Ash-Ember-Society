# Reliability Working Agreement

The four principles + operational rules for how reliability work gets done in this repo.

## Why this exists

Between April and June 2026, this repo shipped ~10 iOS PWA fix PRs: SW activation cycles (#479, #480), redirect loops (#483, #470, #448), splash failures (#468, #452), photo upload crashes (#474), proxy auth hangs, push notification timeouts. Each was individually justified. Collectively, the pattern was firefighting symptoms one report at a time, with no shared view of how often each class of failure was happening or whether the previous fix had actually moved the needle.

The four principles below are the discipline that breaks that pattern. They were chosen 2026-06-03 in a brainstorming session where the goal was clarified as "reliable experience for users" — not app store distribution, not performance for its own sake, but the user-facing reliability of the PWA we already have.

## The four principles

### 1. Telemetry-first

No fix ships for a symptom that isn't visible in telemetry. If a user reports X, step 0 is checking the dashboard. If X isn't covered by an existing event, the first PR is the instrumentation — not the fix. We don't chase ghosts.

This is the rule that prevents debugging-by-anecdote. "A user said it's slow" is not actionable; "p95 cold-start LCP went from 1.8s to 4.2s on iOS Safari last week" is.

### 2. Hypothesis-driven

Every fix PR description opens with a paragraph in this shape:

> **Root cause:** \<X>
> **Evidence:** \<Y — link to telemetry, repro steps, or dashboard snapshot>
> **Why this fix addresses X:** \<Z>
> **Counter-evidence considered:** \<W — what would prove this hypothesis wrong, and why we ruled it out>

If we can't write that paragraph honestly, we have a guess, not a fix. Guesses don't merge.

This is the systematic-debugging discipline encoded as a process artifact. It forces the "diagnose before fix" rule from CLAUDE.md into every reliability PR.

### 3. Validated merges

A reliability PR is ready when all of these are true:

- The repro case from telemetry has been verified to **no longer fire** on the preview deploy.
- The PR description names a **success metric** (e.g. "expect SW activation banner rate to drop from N/day to ~0 within 24h post-deploy").
- A **revert path** exists: either a kill-switch (env var or feature flag) or a documented one-line revert plan.
- For UI-touching changes, Dave has verified on the preview deploy before merge.

"Tests pass" is not the same as "ready." Tests are a floor; validation is the bar.

### 4. Production-safe rollouts

- **Kill-switches** on any change to SW lifecycle, proxy, auth, or anything else that touches > 5% of users. A kill-switch is a single env var or flag that disables the new behavior without redeploying. Required for the change to be considered safe to merge.
- **Vercel Rolling Releases** on risky deploys (SW, proxy, auth, payments). Traffic shifts gradually, auto-stops on error spike. Not yet wired up in this project; should be added before the next risky deploy.
- **Quick-revert plan** documented in every risky PR's description. One line: "If X regresses, revert this commit with Y; no DB migration to roll back."

## The five reliability buckets

These are the categories where intermittent iOS PWA pain has clustered in the recent PR history. Each one has its own root-cause shape and warrants its own dashboard view.

1. **SW lifecycle** — cache invalidation, activate cycle, navigation cache returning stale or redirected responses, update banner cycling.
2. **Auth / session resilience** — JWT verify outcomes, cookie state and domain mismatches, OAuth redirect host drift, session refresh behavior, proxy scope-out events.
3. **Network resilience** — Vercel 4.5MB body limit, offline outbox replay, retry semantics, navigation cache hits on stale chunk URLs after deploy.
4. **iOS WebKit quirks** — splash failures, manifest scope violations (PWA bouncing into in-app browser), redirect cap, app-store-installed shell behavior. Ongoing tax that probably doesn't fully resolve; goal is to detect it fast, not eliminate it.
5. **State persistence** — drafts not saving, optimistic updates failing silently, edits dropped (the burn-report-thirds rating-save bug from PR #481 was in this bucket).

## Build order

Pacing estimated in sessions (~2h each) rather than calendar weeks, since this repo's workflow compresses industry-week estimates into evenings.

1. **Instrumentation pass** (~1-2 sessions): Define event schema. Drop structured Sentry events (`Sentry.captureMessage` with tags, or `Sentry.metrics` where appropriate) in the five buckets. Verify they fire on preview before considering the pass done.
2. **Dashboard** (~1 session): Build 5-6 saved searches/charts in Sentry covering the five buckets. The single page Dave checks when triaging a user report.
3. **PR template** (~30 min): Add `.github/PULL_REQUEST_TEMPLATE/reliability.md` codifying the four principles. PRs touching the five reliability paths reference it.
4. **First investigation pass** (~1-2 sessions): Pick the bucket with the strongest signal from the dashboard. Apply systematic debugging. Ship the first telemetry-validated fix. This is the proof point that the system works.

After step 4, the rhythm becomes: dashboard review → pick bucket → diagnose → fix → validate. That cycle is now load-bearing for reliability work in this repo.

## What this gets us

- We stop deciding from anecdote and start deciding from rate-and-trend.
- The "fix it again" cycle ends. If a bucket's signal hasn't dropped after a fix, the fix didn't work, and we learn that within 24h rather than after the next user report.
- New iOS quirks (Apple will keep shipping them) surface in telemetry first, not in user complaints first.

## What this doesn't get us

- Instant relief. Steps 1-2 produce no user-visible fixes.
- Coverage of problems with no PWA trace (device hardware, ISP issues, third-party outages). These remain outside the system.
- A replacement for app store distribution if that ever becomes a goal. (See the same-day brainstorming session for the native-shell tradeoffs that were considered and parked.)

## Relationship to existing skills and patterns

- **systematic-debugging skill**: Principle 2 (Hypothesis-driven) is the PR-shape encoding of that skill's Phase 1.
- **verification-before-completion skill**: Principle 3 (Validated merges) is the PR-shape encoding of that skill.
- **PR workflow memory ([[feedback_pr_workflow]])**: Already requires new branches and no force-push. The four principles add the *content* requirements; that memory stays as the *structural* requirements.
- **Never break working code ([[feedback_never_break_working_code]])**: Principle 4 (Production-safe rollouts) operationalizes that rule for the specific case of reliability fixes.
