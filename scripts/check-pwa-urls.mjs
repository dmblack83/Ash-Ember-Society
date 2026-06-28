#!/usr/bin/env node
/*
 * PWA URL absoluteness check.
 *
 * Verifies that PWA-critical URLs in source are absolute to
 * www.ashember.vip. Catches the regression where a relative URL would
 * be resolved against the install host (e.g., bare ashember.vip) and
 * hit the bare->www 307 cascade on every cold launch. iOS does NOT
 * follow 307s for apple-touch-startup-image — symptom is 5-10s of
 * black launch screen.
 *
 * Run via `npm run check:pwa`. Wired into CI in .github/workflows/ci.yml.
 *
 * Sister check: post-deploy curl smoke test in the same workflow
 * verifies the deployed URLs return 200 from both hosts.
 */

import { readFileSync } from "node:fs";
import { exit } from "node:process";

const EXPECTED_HOST = "https://www.ashember.vip";

/*
 * NOTE (2026-06-28): the apple-touch-startup-image (iosSplash) source check
 * was removed when the PWA was simplified to network-first and the splash set
 * was dropped from app/layout.tsx. See
 * docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md. The splash
 * PNGs remain committed under public/appstore-images/ios-splash/ and the
 * post-deploy curl smoke test in ci.yml still verifies they return 200, so
 * the absolute-URL regression for those static files stays guarded. If splash
 * references are ever restored in layout, re-add a mustContain check here for
 * the absolute iosSplash URL.
 */
const checks = [
  {
    file:  "app/manifest.ts",
    label: "PWA manifest start_url",
    mustContain:    [`start_url:        "${EXPECTED_HOST}/home"`],
    mustNotContain: [`start_url:        "/home"`],
  },
];

let failed = false;
for (const check of checks) {
  let content;
  try {
    content = readFileSync(check.file, "utf8");
  } catch (e) {
    console.error(`FAIL: cannot read ${check.file}: ${e.message}`);
    failed = true;
    continue;
  }

  for (const needle of check.mustContain) {
    if (!content.includes(needle)) {
      console.error(`FAIL: ${check.file} must contain "${needle}" (${check.label})`);
      failed = true;
    }
  }
  for (const needle of check.mustNotContain) {
    if (content.includes(needle)) {
      console.error(`FAIL: ${check.file} must NOT contain "${needle}" (${check.label})`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("");
  console.error("See app/layout.tsx splash comment and");
  console.error("docs/superpowers/specs/2026-05-30-pwa-cold-launch-redirect-cascade-design.md");
  console.error("for context on why these URLs MUST be absolute.");
  exit(1);
}

console.log(`OK: PWA URLs are absolute to ${EXPECTED_HOST}`);
