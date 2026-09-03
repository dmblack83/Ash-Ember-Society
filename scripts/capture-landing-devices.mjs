/* Captures the real app screens shown in the landing page's Chapter Four
   device trio, then converts them to WebP in public/landing/.

   Privacy rule (landing revisions spec, 2026-09-03): the /lounge capture
   activates the "My Posts" filter first so only the fixture account's own
   content appears — real member names never ship in marketing imagery.

   Run:
     CAPTURE_EMAIL=... CAPTURE_PASSWORD=... node scripts/capture-landing-devices.mjs

   Credentials are the dedicated fixture account (see verify-in-app skill);
   they come from env only.
*/
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "https://www.ashember.vip";
const EMAIL = process.env.CAPTURE_EMAIL;
const PASSWORD = process.env.CAPTURE_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set CAPTURE_EMAIL and CAPTURE_PASSWORD (fixture account).");
  process.exit(1);
}

const OUT_DIR = path.join("public", "landing");
await mkdir(OUT_DIR, { recursive: true });

const SHOTS = [
  { name: "device-iphone", route: "/humidor", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "device-android", route: "/lounge", viewport: { width: 412, height: 915 }, isMobile: true, myPostsFilter: true },
  { name: "device-laptop", route: "/home", viewport: { width: 1512, height: 945 }, isMobile: false },
];

const browser = await chromium.launch({ channel: "chrome" });

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
    isMobile: shot.isMobile,
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/(home|onboarding)\b/, { timeout: 45_000 });
  } catch {
    console.error(`FAIL login for ${shot.name} (still at ${page.url()})`);
    process.exit(1);
  }
  await page.waitForTimeout(4000); // cold-launch overlay + session settle
  await page.goto(`${BASE_URL}${shot.route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (shot.myPostsFilter) {
    try {
      await page.click("text=My Posts", { timeout: 5000 });
      await page.waitForTimeout(1800);
    } catch {
      console.error("FAIL: My Posts filter not found on /lounge — refusing to capture member content.");
      process.exit(1);
    }
  }
  const pngPath = path.join(OUT_DIR, `${shot.name}.png`);
  await page.screenshot({ path: pngPath, fullPage: false });
  const webpPath = path.join(OUT_DIR, `${shot.name}.webp`);
  const info = await sharp(pngPath).webp({ quality: 82 }).toFile(webpPath);
  await unlink(pngPath);
  console.log(`captured ${shot.name}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)}KB webp`);
  await context.close();
}

await browser.close();
console.log(`\nassets written to ${OUT_DIR}/`);
