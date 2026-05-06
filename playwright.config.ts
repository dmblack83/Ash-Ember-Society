import { defineConfig, devices } from "@playwright/test";

/* ------------------------------------------------------------------
   Playwright config — smoke tests only (Phase 1 P1.4).

   Tests run against a deployed URL — usually a Vercel preview or
   localhost. Defaults to http://localhost:3000; override via
   PLAYWRIGHT_BASE_URL.

   Local:
     npm run dev                                           # start dev server
     npm run test:e2e                                      # run tests (in another shell)

   Against a preview deploy:
     PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app \
       npm run test:e2e

   Interactive UI:
     npm run test:e2e:ui

   Reports + traces land in test-results/ and playwright-report/ —
   both gitignored.
   ------------------------------------------------------------------ */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",

  /* Each test file runs in parallel with the others. Tests within
     a file run sequentially unless explicitly marked parallel. */
  fullyParallel: true,

  /* Fail CI runs that left a `.only()` in source. */
  forbidOnly: !!process.env.CI,

  /* CI gets retries for flake; local runs don't (faster feedback). */
  retries: process.env.CI ? 2 : 0,

  /* Single worker on CI keeps Supabase/auth-related state predictable
     when we add authenticated tests. Locally we can parallelize freely. */
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL:       BASE_URL,
    trace:         "on-first-retry",
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use:  { ...devices["Desktop Chrome"] },
    },
    /* Mobile-PWA project can be added later for service-worker /
       standalone-mode tests. Out of scope for the v1 smoke set. */
  ],
});
