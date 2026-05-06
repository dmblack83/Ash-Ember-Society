/* ------------------------------------------------------------------
   Smoke tests — Phase 1 P1.4.

   Five tests covering paths that don't require authenticated state.
   Catches:

     - Marketing landing rendering broken
     - Login page rendering broken
     - Auth proxy redirect for unauth users (the regression class
       that fix/manifest-middleware-307 fought)
     - Offline fallback page renders (PWA-critical)
     - Manifest is served correctly (the recurring fix/manifest-*
       branch class)

   Authenticated paths (humidor add, lounge post, burn report submit,
   avatar upload — 4 of the 5 critical paths in the maintenance plan)
   are stubbed out in authenticated.spec.ts with skip + TODO. They need
   a test user provisioned in Supabase.
   ------------------------------------------------------------------ */

import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("marketing landing renders", async ({ page }) => {
    await page.goto("/");
    /* Don't assert specific copy — that drifts with marketing edits.
       Just verify a real h1 lands and the body has more than the
       global error fallback content. */
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("body")).not.toHaveText(/something went wrong/i);
  });

  test("/login renders the login form", async ({ page }) => {
    await page.goto("/login");
    /* The form should expose at least one input the user can type
       into (email or password). Don't pin to a specific button label —
       it's been edited multiple times. */
    await expect(page.locator('input[type="email"], input[type="password"]').first()).toBeVisible();
  });

  test("/humidor redirects to /login when unauthenticated", async ({ page }) => {
    /* Catches regressions in proxy.ts auth gating. Returns a 3xx
       redirect or client-side bounce; either way URL ends at /login. */
    await page.goto("/humidor");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });

  test("/offline renders without auth", async ({ page }) => {
    await page.goto("/offline");
    /* Page is force-static and bypasses auth. Verifying it survives
       is critical because it's the user-visible recovery surface
       when the SW can't fetch. */
    await expect(page.locator("body")).toContainText(/offline|connection|reconnect/i);
  });

  test("PWA manifest served at /manifest.webmanifest", async ({ request }) => {
    /* Catches the duplicate-manifest / routing-conflict / middleware-307
       bug class that's been patched four times under different names. */
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBe("Ash & Ember Society");
    expect(manifest.start_url).toBe("/home");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
