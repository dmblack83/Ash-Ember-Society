# Testing Patterns

**Analysis Date:** 2026-05-18

## Test Framework

**Runner:** Playwright 1.59.1 (`@playwright/test`). Listed under `devDependencies` in `package.json`.

**Config:** `playwright.config.ts`. Single project (`chromium` / Desktop Chrome). No mobile-PWA project yet — comment at lines 57–58 marks it as future scope for service-worker / standalone-mode tests.

**Assertion library:** Playwright's built-in `expect(locator)` from `@playwright/test`.

**There are NO unit tests, integration tests, or component tests.** No Jest, no Vitest, no React Testing Library. The entire automated test surface is two Playwright spec files.

## Run Commands

From `package.json` scripts:

```bash
npm run dev              # starts Next dev server on :3000 (required for local run)
npm run test:e2e         # runs Playwright headlessly against PLAYWRIGHT_BASE_URL (default http://localhost:3000)
npm run test:e2e:ui      # opens Playwright UI mode for interactive debugging
npm run test:e2e:debug   # opens Playwright Inspector (step-through debugger)
```

**Against a preview deployment:**
```bash
PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app npm run test:e2e
```

The config does NOT start the dev server automatically — there is no `webServer` block in `playwright.config.ts`. The dev server must be running in a separate shell before `npm run test:e2e` is invoked.

## Test File Organization

**Location:** `tests/e2e/` only.

Two files:
- `tests/e2e/smoke.spec.ts` — 5 unauthenticated smoke tests (active, run on every invocation).
- `tests/e2e/authenticated.spec.ts` — 5 authenticated-path stubs, all `test.skip()` until a Supabase test-user fixture is set up.

**Naming:** `*.spec.ts`. The `testDir` is `./tests/e2e`.

**Reports / artefacts:**
- HTML report → `playwright-report/` (gitignored).
- Traces / screenshots / videos → `test-results/` (gitignored).
- CI uses both `github` reporter (for PR annotations) and `html`. Local default reporter is `list`.

## Test Structure

**Suite organisation** (from `tests/e2e/smoke.spec.ts:23`):

```typescript
import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("marketing landing renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("body")).not.toHaveText(/something went wrong/i);
  });
  // ...
});
```

**Conventions observed:**
- One `test.describe` per file, named after the suite (e.g. `"smoke"`, `"authenticated smoke (stubs)"`).
- Test names are full sentences describing the user-observable behaviour ("marketing landing renders", "/humidor redirects to /login when unauthenticated").
- Assertions intentionally loose to survive copy edits: pin to structural elements (`h1`, `input[type="email"]`) and regex patterns (`/offline|connection|reconnect/i`) rather than exact strings.
- Header comments explain WHY each test exists — usually a regression class it catches. See `smoke.spec.ts:1-19`.

**Timeouts:**
- Global per-action timeout: 10 seconds (`playwright.config.ts:49` — `actionTimeout: 10_000`).
- Explicit waits use `page.waitForURL(/\/login/, { timeout: 10_000 })` style.

**Retries:** CI gets 2 retries (flake tolerance), local runs get 0 (fast feedback). `playwright.config.ts:38`.

**Parallelism:** `fullyParallel: true` across files. On CI, workers are pinned to 1 to keep Supabase / auth state predictable once authenticated tests come online. Locally workers default to Playwright's auto-detected count.

**`.only` guard:** `forbidOnly: !!process.env.CI` — any stray `test.only()` fails the CI run.

## Smoke Coverage (active)

`tests/e2e/smoke.spec.ts` runs five tests:

| Test | What it catches |
|------|-----------------|
| marketing landing renders | Top-level rendering regressions on `/` |
| `/login` renders the login form | Login form regressions |
| `/humidor` redirects to `/login` when unauthenticated | `proxy.ts` auth-gate regressions (the `fix/manifest-middleware-307` class) |
| `/offline` renders without auth | PWA offline fallback survives — SW navigation fallback |
| PWA manifest served at `/manifest.webmanifest` | The recurring `fix/manifest-*` bug class (duplicate manifest, routing conflict, middleware-307) |

The manifest test is the most prescriptive — it asserts `name === "Ash & Ember Society"`, `start_url === "/home"`, `display === "standalone"`, and `icons.length > 0`.

## Authenticated Coverage (stubbed, NOT running)

`tests/e2e/authenticated.spec.ts` defines 5 stub tests, all `test.skip()`:

1. login + redirect to `/home`
2. humidor: add cigar from catalog
3. lounge: create new post
4. burn report: submit
5. account: avatar upload

These are the 5 critical authenticated paths from the maintenance plan (P1.4). The file header (lines 1–26) documents the steps needed to enable them:

1. Provision a dedicated test user in Supabase (email + password).
2. Add `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` to Vercel env (preview) and `.env.local`.
3. Add a Playwright "setup" project that signs in once and saves cookie state to `playwright/.auth/user.json`.
4. Mark tests with `test.use({ storageState: "..." })` to reuse the saved session.

Until step 1 happens, these tests stay as `test.skip(...)` so they show up in the runner output as documented coverage gaps.

## Mocking

**None.** Tests run against a real environment (local dev server or a deployed preview), with a real Supabase project. There is no MSW, no `jest.mock()`, no Playwright route-interception used in the current specs.

If route interception becomes necessary (e.g. to test offline-outbox replay deterministically), use Playwright's `page.route()` API to stub specific URLs while leaving the rest live.

## Fixtures / Test Data

**No fixture directory** (`tests/fixtures/` does not exist). The avatar-upload stub mentions needing one in its TODO comment (`authenticated.spec.ts:55-57`).

**No factory functions** for seeding rows. Production seed scripts in `scripts/seed-*.ts` are for the live database, not for tests.

## CI Integration

**`.github/workflows/ci.yml` exists**, but it runs typecheck only — `npx tsc --noEmit` for the main project plus `tsc --project tsconfig.sw.json --noEmit` for the service worker source.

The workflow's header comment (lines 1–20) explicitly states what is NOT covered:
- Lint (`npm run lint`) — `main` has 63 pre-existing `@typescript-eslint/no-explicit-any` errors that would block every PR.
- Production build (`next build`) — Vercel preview deploys cover this.
- **End-to-end tests — "none in the repo today."** This comment is now stale: Playwright tests landed after the CI file was written, but the workflow was never updated to run them.
- Performance budget.

**The PROJECT_STATE.md claim that "no `.github/workflows` exists" is also stale** — the workflow file exists. The substantive point — that there is no CI gate beyond typecheck — is still accurate: the e2e tests are not invoked by any GitHub Action.

## Coverage

**No coverage requirement.** Playwright supports coverage via its tracing tools but no script in `package.json` collects it, and no minimum bar is enforced.

## Gaps

These are the concrete holes in test coverage as of 2026-05-18:

- **No unit tests for `lib/`.** High-value targets that have no tests:
  - `lib/log.ts` (Sentry forwarding, level-based emit, error serialization).
  - `lib/membership.ts` (tier rank comparisons, feature access checks).
  - `lib/cigar-default-image.ts` (wrapper-string → image-path mapping).
  - `lib/burn-report-draft.ts` (localStorage draft persistence).
  - `lib/offline-outbox.ts` (queued-mutation replay).
  - `lib/haptics.ts` (no-op safety on SSR / no-vibration browsers).
  - `lib/data/keys.ts` (`keyFor.*` cache-key shape — drift breaks SWR invalidation silently).
- **No component tests.** No React Testing Library / Vitest setup. Visual regressions and prop-shape regressions are only caught by humans clicking through the app.
- **No tests for proxy auth flow.** `proxy.ts` is the single hottest auth path; only the redirect side-effect is smoke-covered.
- **Authenticated paths are entirely uncovered** until the Playwright auth fixture lands.
- **No Stripe webhook tests.** `app/api/stripe/webhook/route.ts` runs unmocked in production.
- **No cron-route tests.** `app/api/cron/aging-ready/route.ts`, `app/api/cron/push-retry/route.ts` are exercised only by Vercel's cron pings hitting production.
- **No service-worker tests.** `app/sw.ts` (Serwist) is not covered. The smoke spec verifies `/offline` renders but not that the SW actually intercepts navigations correctly.
- **No CI gate runs the e2e tests.** They must be run manually.

## Adding a New Test

**For a smoke addition** (unauthenticated, regression catcher): drop a new `test(...)` block inside the existing `test.describe("smoke", ...)` in `tests/e2e/smoke.spec.ts`. Follow the pattern in the existing five tests — header comment explaining the regression class it catches, loose assertions that survive copy edits.

**For authenticated coverage:** unstub the matching test in `tests/e2e/authenticated.spec.ts`. First requirement is the Supabase test user + Playwright `setup` project; do that work as its own PR before unstubbing individual tests.

**For unit/component tests:** there is no setup. Adding Vitest or Jest is itself a maintenance-plan item. Discuss before starting — choice affects bundle reports, CI runtime, and integration with Next 16's server-component model.

---

*Testing analysis: 2026-05-18*
