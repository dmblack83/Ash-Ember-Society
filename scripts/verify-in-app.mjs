/* ------------------------------------------------------------------
   verify-in-app.mjs — runtime verification harness

   Logs into the app with the dedicated TEST account, visits the
   routes you name, screenshots each, and reports console errors and
   failed requests. This is how a session produces the runtime
   evidence that verification-before-completion demands.

   Usage:
     CAPTURE_EMAIL=... CAPTURE_PASSWORD=... \
       node scripts/verify-in-app.mjs [baseUrl] [route ...]

     baseUrl defaults to https://www.ashember.vip
     routes default to: /home /humidor /lounge /discover/cigar-news /account

   Output: verification-shots/<timestamp>/<route>.png + a PASS/FAIL
   summary per route (FAIL = console error, pageerror, or a request
   that returned >= 500).

   Credentials come from env only — never hardcode them here. The
   test account is a dedicated fixture user, not a real member.
   ------------------------------------------------------------------ */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.argv[2]?.startsWith("http")
  ? process.argv[2]
  : (process.env.CAPTURE_BASE_URL ?? "https://www.ashember.vip");
const routeArgs = process.argv.slice(2).filter((a) => a.startsWith("/"));
const ROUTES = routeArgs.length > 0
  ? routeArgs
  : ["/home", "/humidor", "/lounge", "/discover/cigar-news", "/account"];

const EMAIL = process.env.CAPTURE_EMAIL;
const PASSWORD = process.env.CAPTURE_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set CAPTURE_EMAIL and CAPTURE_PASSWORD env vars (test account only).");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_DIR = path.join("verification-shots", stamp);
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
});
const page = await context.newPage();

/* Collect failure signals per route. */
let consoleErrors = [];
let pageErrors = [];
let serverErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
});
page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 300)));
page.on("response", (res) => {
  if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url().slice(0, 120)}`);
});
function resetSignals() { consoleErrors = []; pageErrors = []; serverErrors = []; }

/* Login (same flow as capture-screens.mjs). */
await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="email"]');
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
try {
  await page.waitForURL(/\/(home|onboarding)\b/, { timeout: 45_000 });
} catch {
  console.error(`FAIL login: did not redirect (still at ${page.url()})`);
  await page.screenshot({ path: path.join(OUT_DIR, "_login-failure.png") });
  console.error("If the password was rotated, update the stored test-account credentials.");
  process.exit(1);
}
await page.waitForTimeout(4000); // cold-launch overlay + session settle
console.log(`logged in as test account (${new URL(page.url()).pathname})`);

const results = [];
for (const route of ROUTES) {
  resetSignals();
  const name = route.replaceAll("/", "_").replace(/^_/, "") || "root";
  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
    const fail = consoleErrors.length + pageErrors.length + serverErrors.length > 0;
    results.push({ route, status: fail ? "FAIL" : "PASS", consoleErrors, pageErrors, serverErrors });
  } catch (err) {
    results.push({ route, status: "FAIL", consoleErrors, pageErrors,
      serverErrors: [...serverErrors, `navigation: ${String(err).slice(0, 200)}`] });
  }
}

console.log(`\nscreenshots: ${OUT_DIR}/`);
let failed = 0;
for (const r of results) {
  console.log(`${r.status}  ${r.route}`);
  if (r.status === "FAIL") {
    failed++;
    for (const e of r.pageErrors)    console.log(`   pageerror: ${e}`);
    for (const e of r.consoleErrors) console.log(`   console:   ${e}`);
    for (const e of r.serverErrors)  console.log(`   server:    ${e}`);
  }
}
await browser.close();
process.exit(failed > 0 ? 1 : 0);
