/* ------------------------------------------------------------------
   Authenticated smoke tests — STUBS.

   These cover the four authenticated critical paths from the
   maintenance plan (P1.4):

     - Login → /home redirect (the success path)
     - Humidor: add cigar
     - Lounge: create post
     - Burn report: submit
     - Account: avatar upload

   All skipped until a Playwright auth fixture is set up:

     1. Provision a dedicated test user in Supabase (email + password)
     2. Add TEST_USER_EMAIL + TEST_USER_PASSWORD to Vercel env (preview)
        and to .env.local for local runs
     3. Add a Playwright "setup" project that signs in once and saves
        the cookie state to playwright/.auth/user.json
     4. Mark these tests with `test.use({ storageState: "..." })` so
        they reuse the saved session

   Once the fixture is in place, fill in the implementation below.
   These stubs document the intended coverage so the test surface is
   visible in the runner output even before they execute.
   ------------------------------------------------------------------ */

import { test } from "@playwright/test";

test.describe("authenticated smoke (stubs)", () => {
  test.skip("login + redirect to /home", async () => {
    /* TODO: navigate to /login, fill TEST_USER credentials, submit,
       expect URL to land on /home, expect masthead greeting visible. */
  });

  test.skip("humidor: add cigar from catalog", async () => {
    /* TODO: from /home, navigate to /humidor, open AddCigarSheet,
       search for a known catalog cigar, add it, expect new card
       visible in the grid. */
  });

  test.skip("lounge: create new post", async () => {
    /* TODO: navigate to /lounge, open NewPostSheet, type a title +
       body, submit, expect post visible at top of feed with current
       user as author. */
  });

  test.skip("burn report: submit", async () => {
    /* TODO: navigate to /humidor/<seed-cigar-id>/burn-report,
       fill required fields (date, rating, notes), submit, expect
       redirect or toast confirming the burn report saved. */
  });

  test.skip("account: avatar upload", async () => {
    /* TODO: navigate to /account, upload a small fixture image as
       avatar, expect new avatar visible. Needs an avatar fixture in
       tests/fixtures/. */
  });
});
