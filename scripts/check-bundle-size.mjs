#!/usr/bin/env node
/* ------------------------------------------------------------------
   Bundle-size gate.

   Compares the current build's bundle numbers against the committed
   baseline (scripts/bundle-baseline.json) and fails when either:
     - total /_next/static/chunks bytes grow past tolerance, or
     - any tracked app route's analyze.data grows past tolerance.

   analyze.data figures are DIAGNOSTIC (not shipped bytes) — but
   same-route-across-builds deltas are exactly what they're valid for
   (see BUNDLE_BASELINE.md "Caveats"). New routes warn (informational)
   so adding a page never blocks; deliberate growth is accepted by
   regenerating the baseline.

   Usage:
     node scripts/check-bundle-size.mjs           # gate (CI)
     node scripts/check-bundle-size.mjs --write   # regenerate baseline

   Requires a fresh `next build` + `next experimental-analyze --output`.
   ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";

const ROOT          = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts/bundle-baseline.json");
const ANALYZE_DIR   = path.join(ROOT, ".next/diagnostics/analyze/data");
const CHUNKS_DIR    = path.join(ROOT, ".next/static/chunks");

/* Growth tolerance: whichever is larger of +10% or +20 KB absolute,
   per metric. Small routes get absolute headroom; big ones get the
   percentage. */
const TOLERANCE_PCT   = 0.10;
const TOLERANCE_BYTES = 20_000;

function allowed(baseline) {
  return Math.max(baseline * TOLERANCE_PCT, TOLERANCE_BYTES);
}

function collectRoutes() {
  /* Walk analyze/data for app-route analyze.data files; skip /api. */
  const routes = {};
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      } else if (entry.name === "analyze.data") {
        const route = rel ? `/${rel}` : "/";
        if (route.startsWith("/api/") || route === "/middleware") continue;
        routes[route] = fs.statSync(abs).size;
      }
    }
  };
  walk(ANALYZE_DIR, "");
  return routes;
}

function collectChunksTotal() {
  let total = 0;
  for (const entry of fs.readdirSync(CHUNKS_DIR)) {
    total += fs.statSync(path.join(CHUNKS_DIR, entry)).size;
  }
  return total;
}

function main() {
  if (!fs.existsSync(ANALYZE_DIR) || !fs.existsSync(CHUNKS_DIR)) {
    console.error(
      "Missing build output. Run `next build` and `next experimental-analyze --output` first.",
    );
    process.exit(2);
  }

  const current = {
    generatedAt: new Date().toISOString().slice(0, 10),
    chunksTotalBytes: collectChunksTotal(),
    routes: collectRoutes(),
  };

  if (process.argv.includes("--write")) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
    console.log(
      `Baseline written: ${Object.keys(current.routes).length} routes, ` +
      `${Math.round(current.chunksTotalBytes / 1024)} KB chunks total.`,
    );
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const failures = [];
  const notes    = [];

  const chunkGrowth = current.chunksTotalBytes - baseline.chunksTotalBytes;
  if (chunkGrowth > allowed(baseline.chunksTotalBytes)) {
    failures.push(
      `chunks total: ${Math.round(baseline.chunksTotalBytes / 1024)} KB → ` +
      `${Math.round(current.chunksTotalBytes / 1024)} KB (+${Math.round(chunkGrowth / 1024)} KB)`,
    );
  }

  for (const [route, bytes] of Object.entries(current.routes)) {
    const base = baseline.routes[route];
    if (base === undefined) {
      notes.push(`new route (not gated): ${route} at ${Math.round(bytes / 1024)} KB`);
      continue;
    }
    const growth = bytes - base;
    if (growth > allowed(base)) {
      failures.push(
        `${route}: ${Math.round(base / 1024)} KB → ${Math.round(bytes / 1024)} KB ` +
        `(+${Math.round(growth / 1024)} KB, tolerance ${Math.round(allowed(base) / 1024)} KB)`,
      );
    }
  }

  for (const note of notes) console.log(`ℹ ${note}`);

  if (failures.length > 0) {
    console.error("\nBundle-size gate FAILED:\n");
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(
      "\nIf the growth is deliberate, regenerate the baseline:\n" +
      "  npm run build && npm run analyze && node scripts/check-bundle-size.mjs --write\n" +
      "and commit scripts/bundle-baseline.json with an explanation.",
    );
    process.exit(1);
  }

  console.log(
    `Bundle-size gate OK — ${Object.keys(current.routes).length} routes within tolerance, ` +
    `chunks total ${Math.round(current.chunksTotalBytes / 1024)} KB ` +
    `(baseline ${Math.round(baseline.chunksTotalBytes / 1024)} KB).`,
  );
}

main();
