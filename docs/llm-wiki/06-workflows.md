# Workflows — how work ships here

> TL;DR for agents: sync main before branching, one concern per PR, never push to a
> merged branch, verify with real output before claiming done, and treat manual SQL
> as a deploy gate. Dave is not an engineer — communicate outcomes, not mechanics.

## Branching and PRs (hard rules)

1. **Sync first, always.** The sandbox routinely starts with stale local main:
   `git fetch origin main && git checkout main && git merge --ff-only origin/main`.
   Verify: `git log --oneline main..origin/main` prints nothing.
2. **Each unit of work = new branch off fresh main + new PR.** No amend/force-push,
   no bundled "while I'm in there" cleanups, one concern per PR.
3. **Pre-push preflight (non-negotiable):** `gh pr list --head <branch> --state all`
   — confirm the PR is OPEN before pushing. Never push to a merged PR's branch.
4. **Post-merge follow-ups** go on a fresh branch off origin/main (cherry-pick if
   needed), never onto the merged source branch.
5. **Squash-merge ghost check:** for stacked PRs, confirm the change actually reached
   main with `git show origin/main:<path>` — the Merged badge can lie.

## Verification before "done"

- Run the check, read the output, then claim the result. Never assert success from
  reasoning alone.
- Minimum gate for app changes: `npx tsc --noEmit`, production build, and the
  relevant test suite. CI runs typecheck (main + tsconfig.sw.json), bundle-size gate,
  sw-precache-check, and Playwright e2e (including an authenticated suite).
- Bundle gate: `scripts/check-bundle-size.mjs` diffs against
  `scripts/bundle-baseline.json`. If a legitimate increase trips it, update the
  baseline in the same PR and say why in the PR body.
- Weigh performance cost (bundle, LCP, INP, SW behavior) on every change. The shipped
  perf phases (see 04-performance.md) must not regress.

## Database changes

- Repo SQL is NOT applied automatically. Dave runs SQL by hand in the Supabase SQL
  editor. Every migration ships as: (1) the SQL file in the repo, (2) the exact SQL
  pasted in chat as a copy-paste block, (3) a verify query, (4) an explicit flag that
  applying it is a pre-deploy gate.
- After Dave applies, run the verify query result past him before shipping dependent
  code. Migration drift has caused two production incidents.

## Engineering posture

- **Never break functioning code.** Prefer the smallest change that fixes the actual
  cause. A revert is a valid fix. Architectural changes are never bundled as bugfixes.
- **Diagnose before fixing.** State the root cause in plain words before proposing a
  change. After 3+ failed targeted fixes, ship instrumentation, not more guesses.
- **Verify premises before executing plans.** Roadmap/backlog items decay against the
  moving codebase — read the actual files before expanding a phase into work.
- **Precedent is not permission.** An existing file appearing to violate a toolchain
  constraint doesn't validate your change; run the cheap build/typecheck first.

## Communication with Dave

- Not an engineer. Minimal but complete; explain the "what" only where a decision is
  needed, the "how" only when asked. No filler, no hedging, no recaps.
- Prompts intended for other Claude sessions go in markdown code blocks (copy button).
- No em dashes in user-facing copy (UI strings, marketing, blog, push, email). Code,
  docs, commits are exempt.
- UI work: iterate on local interactive mockups in the lounge palette before writing
  app code; for open-ended redesigns, validate aesthetic direction with 2-3 cheap
  hero-only comps before building anything full-page.
- Timeline estimates in sessions/hours, not weeks.

## Session mechanics

- `PROJECT_STATE.md` is auto-loaded and updated at session end; keep it truthful.
- Superpowers is the active methodology (brainstorm → plan → execute → verify). GSD is
  dormant; `.planning/` is reference-only.
- Session close: `/close` writes `session-logs/LAST.md` with a pick-up line for the
  next session.
