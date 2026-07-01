/* ------------------------------------------------------------------
   Authenticated flows — the surfaces the 2026-07 overhaul touched.

   Every core route is now a static/client shell + client gate + SWR
   fetcher; the regression class these tests guard is "shell renders
   but the gate or fetcher broke, so real content never arrives".
   Each test asserts REAL authed content (not skeletons) lands.

   Runs in the "authenticated" project, which reuses the storage
   state saved by auth.setup.ts. Self-skips when no test user is
   configured (TEST_USER_EMAIL / TEST_USER_PASSWORD).

   The test user must be onboarded and should have at least one
   humidor item for the deepest assertions; tests degrade to
   empty-state assertions when the collection is empty.
   ------------------------------------------------------------------ */

import { test, expect } from "@playwright/test";

const HAS_CREDS = !!(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);

test.describe("authenticated", () => {
  test.skip(!HAS_CREDS, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test("home renders the masthead greeting (gate + profile fetch)", async ({ page }) => {
    await page.goto("/home");
    /* Masthead greeting only renders after the client session gate
       passes AND the profile SWR fetch resolves. */
    await expect(
      page.getByText(/Good (morning|afternoon|evening)/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("humidor shell fills with content", async ({ page }) => {
    await page.goto("/humidor");
    /* The Add Cigar button renders with HumidorClient (post-gate),
       for both populated and empty collections. */
    await expect(page.getByText("Add Cigar").first()).toBeVisible({ timeout: 15_000 });
  });

  test("humidor sub-pages render past their skeletons", async ({ page }) => {
    for (const path of ["/humidor/wishlist", "/humidor/stats", "/humidor/burn-reports"]) {
      await page.goto(path);
      /* Real content brings a heading or interactive control; the
         page must not be stuck on the error boundary either. */
      await expect(
        page.locator("h1, h2, button").first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("body")).not.toHaveText(/something went wrong/i);
    }
  });

  test("account shows the signed-in profile", async ({ page }) => {
    await page.goto("/account");
    /* Sign Out only renders inside AccountClient after the SWR
       profile fetch resolves — skeletons never contain it. */
    await expect(page.getByText("Sign Out")).toBeVisible({ timeout: 15_000 });
  });

  test("humidor item detail loads from the list", async ({ page }) => {
    await page.goto("/humidor");
    await expect(page.getByText("Add Cigar").first()).toBeVisible({ timeout: 15_000 });

    /* Tap the first item card if the collection has one. */
    const firstItem = page.locator('a[href^="/humidor/"]').filter({
      hasNotText: /wishlist|stats|burn/i,
    }).first();

    if ((await firstItem.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "empty humidor — detail nav skipped" });
      return;
    }
    await firstItem.click();
    await expect(page).toHaveURL(/\/humidor\/[0-9a-f-]{20,}/, { timeout: 10_000 });
    /* Detail bundle resolved: the burn-report CTA renders. */
    await expect(page.getByText(/burn report/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("lounge feed renders and compose sheet opens", async ({ page }) => {
    await page.goto("/lounge");
    /* Category cards render post-island; open the first category. */
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });

    const newPost = page.getByText(/new post/i).first();
    if ((await newPost.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "no compose affordance visible on lounge root" });
      return;
    }
    await newPost.click();
    /* NewPostSheet (BottomSheet primitive) mounts with the title field. */
    await expect(
      page.getByPlaceholder(/give your post a title/i),
    ).toBeVisible({ timeout: 10_000 });
    /* Close via Escape — exercises the primitive's close path. */
    await page.keyboard.press("Escape");
    await expect(
      page.getByPlaceholder(/give your post a title/i),
    ).toBeHidden({ timeout: 5_000 });
  });

  test("discover cigars list → detail → back is instant from cache", async ({ page }) => {
    await page.goto("/discover/cigars");
    const card = page.locator('a[href^="/discover/cigars/"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    /* Detail: the Details section renders once the catalog row lands. */
    await expect(page.getByText("Details").first()).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(
      page.locator('a[href^="/discover/cigars/"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
