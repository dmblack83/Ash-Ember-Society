import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------
   Free-tier humidor cap E2E

   Requires env vars (defined in .env.local; not committed):
     NEXT_PUBLIC_SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     E2E_FREE_USER_EMAIL
     E2E_FREE_USER_PASSWORD
     E2E_FREE_USER_ID

   NOTE: tests/e2e/authenticated.spec.ts is a stub set with no real
   env-var convention yet, so this spec introduces the E2E_FREE_USER_*
   names. Future authenticated specs can reuse them.

   Selector assumptions (verified against current source on
   feat/free-tier-humidor-limit @ 8c3d430):
     - Cigar detail trigger:  <button>Add to Humidor</button>
       (components/cigars/CigarActions.tsx)
     - Sheet submit button:   <button type="submit">Add to Humidor</button>
       (components/cigars/AddToHumidorSheet.tsx)
     - Cap modal heading:     `You've reached your ${CAP}-cigar limit`
       (components/membership/UpgradeLimitModal.tsx)
     - Upgrade CTA:           <Link href="/account?tab=membership">
                                Upgrade to Member
                              </Link>
   If any of those strings shift, the selectors below need to follow.
   ------------------------------------------------------------------ */

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_EMAIL    = process.env.E2E_FREE_USER_EMAIL!;
const USER_PASSWORD = process.env.E2E_FREE_USER_PASSWORD!;
const USER_ID       = process.env.E2E_FREE_USER_ID!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

/* Free-tier unique-cigar cap. Mirrors FREE_TIER_LIMITS.humidor_items in
   lib/membership.ts and the trigger threshold in
   supabase/migrations/20260703_free_tier_20_unique.sql. */
const CAP = 20;
const CAP_HEADING = `You've reached your ${CAP}-cigar limit`;

/** Wipe humidor_items for the test user and seed with `count` distinct cigars.
 *  Returns the seeded cigar_ids plus one spare unseeded id for over-cap tests. */
async function seedHumidor(count: number): Promise<{ seeded: string[]; spare: string }> {
  await admin.from("humidor_items").delete().eq("user_id", USER_ID);

  const { data: cigars, error } = await admin
    .from("cigar_catalog")
    .select("id")
    .order("usage_count", { ascending: false })
    .limit(count + 1);

  if (error || !cigars || cigars.length < count + 1) {
    throw new Error("Failed to seed cigars: not enough catalog rows.");
  }

  const seeded = cigars.slice(0, count).map((c) => c.id as string);
  const spare  = cigars[count].id as string;

  if (seeded.length > 0) {
    await admin.from("humidor_items").insert(
      seeded.map((cigar_id) => ({
        user_id: USER_ID,
        cigar_id,
        quantity: 1,
        is_wishlist: false,
      })),
    );
  }

  return { seeded, spare };
}

test.describe("free-tier humidor cap", () => {
  test.beforeEach(async ({ page }) => {
    await admin.from("profiles").update({ membership_tier: "free" }).eq("id", USER_ID);

    await page.goto("/login");
    await page.fill('input[type="email"]', USER_EMAIL);
    await page.fill('input[type="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/home|\/onboarding|\/$/);
  });

  test("free user one under the cap can add one more", async ({ page }) => {
    const { spare } = await seedHumidor(CAP - 1);

    await page.goto(`/discover/cigars/${spare}`);
    await page.getByRole("button", { name: /add to humidor/i }).first().click();
    await page.locator('button[type="submit"]', { hasText: /add to humidor/i }).click();

    await expect(page.getByText(CAP_HEADING)).toHaveCount(0);
    await expect(page.getByText(/added/i)).toBeVisible({ timeout: 5_000 });
  });

  test("free user at the cap is blocked on the next distinct cigar", async ({ page }) => {
    const { spare } = await seedHumidor(CAP);

    await page.goto(`/discover/cigars/${spare}`);
    await page.getByRole("button", { name: /add to humidor/i }).first().click();
    await page.locator('button[type="submit"]', { hasText: /add to humidor/i }).click();

    await expect(page.getByText(CAP_HEADING)).toBeVisible();
    await expect(page.getByRole("link", { name: /upgrade to member/i })).toBeVisible();

    const { data: rows } = await admin
      .from("humidor_items")
      .select("cigar_id")
      .eq("user_id", USER_ID)
      .eq("cigar_id", spare);
    expect(rows ?? []).toHaveLength(0);
  });

  test("free user can add another batch of an already-owned cigar at the cap", async ({ page }) => {
    const { seeded } = await seedHumidor(CAP);
    const ownedCigarId = seeded[0];

    await page.goto(`/discover/cigars/${ownedCigarId}`);
    await page.getByRole("button", { name: /add to humidor/i }).first().click();
    // First submit attempt triggers the "already own this cigar" conflict UI
    // in AddToHumidorSheet (Add to existing / Add as new entry / Back).
    await page.locator('button[type="submit"]', { hasText: /add to humidor/i }).click();
    // Choose "Add as new entry" to route through addHumidorItem → the
    // same-cigar exemption in assertCanAddHumidor should let this through.
    await page.getByRole("button", { name: /add as new entry/i }).click();

    await expect(page.getByText(CAP_HEADING)).toHaveCount(0);

    const { count } = await admin
      .from("humidor_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID)
      .eq("cigar_id", ownedCigarId);
    expect(count ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("upgrade CTA lands on /account with the Membership sheet open", async ({ page }) => {
    const { spare } = await seedHumidor(CAP);

    await page.goto(`/discover/cigars/${spare}`);
    await page.getByRole("button", { name: /add to humidor/i }).first().click();
    await page.locator('button[type="submit"]', { hasText: /add to humidor/i }).click();

    await page.getByRole("link", { name: /upgrade to member/i }).click();

    await expect(page).toHaveURL(/\/account\?tab=membership/);
    await expect(page.getByText(/membership/i).first()).toBeVisible();
  });

  test("Manage humidor CTA closes modal and stays on prior page", async ({ page }) => {
    const { spare } = await seedHumidor(CAP);

    await page.goto(`/discover/cigars/${spare}`);
    const cigarDetailUrl = page.url();

    await page.getByRole("button", { name: /add to humidor/i }).first().click();
    await page.locator('button[type="submit"]', { hasText: /add to humidor/i }).click();

    // Modal opens.
    await expect(page.getByText(CAP_HEADING)).toBeVisible();

    // Click "Manage humidor" — secondary CTA — should just close the modal.
    await page.getByRole("button", { name: /manage humidor/i }).click();

    // Modal gone, URL unchanged (no forced redirect).
    await expect(page.getByText(CAP_HEADING)).toHaveCount(0);
    expect(page.url()).toBe(cigarDetailUrl);
  });

  test.afterAll(async () => {
    await admin.from("humidor_items").delete().eq("user_id", USER_ID);
  });
});
