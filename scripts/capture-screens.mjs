/* ------------------------------------------------------------------
   capture-screens.mjs

   Captures the current app screens as HTML + PNG reference material
   for the Ash & Ember design system (design-systems/ash-ember/).
   The output lets Open Design refine real screens, not guess from
   tokens alone.

   Usage:
     npm run dev                                  # in another shell
     CAPTURE_EMAIL=... CAPTURE_PASSWORD=... \
       node scripts/capture-screens.mjs

   Reads credentials from env only — never hardcode them here.
   Output: design-systems/ash-ember/reference-screens/
   ------------------------------------------------------------------ */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.CAPTURE_EMAIL;
const PASSWORD = process.env.CAPTURE_PASSWORD;
const OUT_DIR = path.join("design-systems", "ash-ember", "reference-screens");

if (!EMAIL || !PASSWORD) {
  console.error("Set CAPTURE_EMAIL and CAPTURE_PASSWORD env vars.");
  process.exit(1);
}

/** Routes to capture. `cigar-detail` is resolved at runtime. */
const ROUTES = [
  { name: "home", url: "/home" },
  { name: "humidor", url: "/humidor" },
  { name: "lounge", url: "/lounge" },
  { name: "account", url: "/account" },
];

async function settle(page, ms = 3000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** Strip dev-only and non-portable nodes so the saved HTML reads clean. */
async function cleanDom(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll("script, noscript, nextjs-portal, [data-nextjs-toast]")
      .forEach((el) => el.remove());
  });
}

async function capture(page, name, url) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await cleanDom(page);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
  });
  const html = await page.evaluate(
    () => `<!doctype html>\n${document.documentElement.outerHTML}`,
  );
  await writeFile(path.join(OUT_DIR, `${name}.html`), html, "utf8");
  console.log(`captured ${name}  (${url})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();

  // Login.
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/(home|onboarding)\b/, { timeout: 45_000 });
  } catch {
    console.error(`login did not redirect — still at ${page.url()}`);
    await page.screenshot({ path: path.join(OUT_DIR, "_login-failure.png") });
    throw new Error("login failed; see _login-failure.png");
  }
  await settle(page, 5000); // let the cold-launch overlay clear
  console.log(`logged in (landed on ${new URL(page.url()).pathname})`);

  // Resolve a real cigar-detail route from the humidor.
  await page.goto(`${BASE_URL}/humidor`, { waitUntil: "domcontentloaded" });
  await settle(page);
  let detailUrl = await page.evaluate(() => {
    const a = document.querySelector(
      'a[href^="/humidor/"]:not([href$="/stats"]):not([href$="/wishlist"]):not([href$="/burn-reports"])',
    );
    return a ? new URL(a.href).pathname : null;
  });
  if (!detailUrl) {
    await page.goto(`${BASE_URL}/discover/cigars`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page);
    detailUrl = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/discover/cigars/"]');
      return a ? new URL(a.href).pathname : null;
    });
  }

  for (const route of ROUTES) {
    await capture(page, route.name, route.url);
  }
  if (detailUrl) {
    await capture(page, "cigar-detail", detailUrl);
  } else {
    console.warn("no cigar-detail route found — skipped");
  }

  await browser.close();
  console.log(`\ndone — output in ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
