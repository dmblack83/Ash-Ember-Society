/* ------------------------------------------------------------------
   Auth fixture setup — signs in once, saves cookie/storage state for
   the "authenticated" Playwright project.

   Requires a dedicated test user:
     TEST_USER_EMAIL / TEST_USER_PASSWORD in the environment
     (.env.local for local runs; CI secrets when wired there).

   Without credentials this writes an EMPTY storage state so the
   authenticated project can still construct its browser context —
   its specs then self-skip on the same env check.
   ------------------------------------------------------------------ */

import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const AUTH_STATE = path.join(__dirname, "../../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });

  const email    = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    fs.writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    return;
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  /* Login lands on /home (or /onboarding for a fresh account — the
     test user must be onboarded). */
  await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_STATE });
});
