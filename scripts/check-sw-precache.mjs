#!/usr/bin/env node
/*
 * SW precache cookieless-200 check.
 *
 * Fetches the deployed sw.js, extracts every URL in its precache
 * manifest, and verifies each one returns 200 from a cookieless
 * context (the same context the SW install fetcher runs in).
 *
 * Catches the regression where an auth-gated route or admin tool
 * gets auto-included in the Serwist precache via the default
 * public/<asterisk><asterisk>/<asterisk> glob. When that happens,
 * SW install hangs in "installing" forever and push notifications
 * (and any other code path that awaits navigator.serviceWorker.ready)
 * times out at 120s.
 *
 * Background: this exact bug took 6+ symptom-targeted PRs before
 * diagnostic instrumentation (PR #472) revealed the SW was stuck on
 * a single precache fetch to /public/badge-preview returning 401.
 * Fixed in PR after that by excluding the file from the glob; this
 * script is the architectural follow-up so the next contributor to
 * add an auth-gated file to public/ gets a hard failure in CI
 * instead of users hitting the timeout.
 *
 * Usage:
 *   SW_PRECACHE_BASE_URL=https://www.ashember.vip node scripts/check-sw-precache.mjs
 *
 * Default base URL is production. Override for testing against a
 * preview deploy.
 */

const BASE_URL = process.env.SW_PRECACHE_BASE_URL ?? "https://www.ashember.vip";

async function fetchSwSource() {
  const res = await fetch(`${BASE_URL}/sw.js`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${BASE_URL}/sw.js: HTTP ${res.status}`);
  }
  return res.text();
}

function extractPrecacheUrls(swSource) {
  /* Serwist emits its manifest as an inline array literal in the
     compiled SW. Each entry looks like {revision:null,url:"/foo"} or
     {revision:"abc",url:"/bar"}. A regex on the url:"..." pattern is
     resilient to whitespace, key-order, and Serwist version changes. */
  const matches = [...swSource.matchAll(/url:"([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

async function checkUrl(url) {
  const fullUrl = `${BASE_URL}${url}`;
  try {
    const res = await fetch(fullUrl);
    return { url, status: res.status, ok: res.status === 200 };
  } catch (e) {
    return { url, status: 0, ok: false, error: e.message };
  }
}

async function main() {
  console.log(`Checking SW precache against ${BASE_URL} ...`);

  const swSource = await fetchSwSource();
  const urls     = extractPrecacheUrls(swSource);

  if (urls.length === 0) {
    console.error(
      "ERROR: No precache URLs extracted from sw.js. The extraction regex may " +
        "need updating if Serwist's output format changed.",
    );
    process.exit(1);
  }

  console.log(`Found ${urls.length} precache URLs. Verifying each returns 200 cookieless ...`);

  /* All checks run in parallel — Vercel handles the load and each
     fetch is short. With ~100 entries this completes in a few seconds. */
  const results = await Promise.all(urls.map(checkUrl));

  const failures = results.filter((r) => !r.ok);

  if (failures.length === 0) {
    console.log(`OK: all ${urls.length} precache URLs return 200`);
    return;
  }

  console.error("");
  console.error(`FAIL: ${failures.length} precache URL(s) returned non-200 cookieless.`);
  console.error("SW install will hang on these entries; push notifications will time out.");
  console.error("");
  for (const f of failures) {
    const detail = f.error ? `network error: ${f.error}` : `HTTP ${f.status}`;
    console.error(`  ${detail}  ${f.url}`);
  }
  console.error("");
  console.error("Fix options:");
  console.error("  1. Add the offending path(s) to globIgnores in serwist.config.mjs");
  console.error("  2. Make the route return 200 in a cookieless context");
  console.error("  3. Move the file out of public/ if it's a dev/admin artifact");
  process.exit(1);
}

main().catch((e) => {
  console.error(`check-sw-precache failed: ${e.message}`);
  process.exit(1);
});
