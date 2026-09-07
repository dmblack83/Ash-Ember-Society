/*
 * Catalog line audit — read-only. Produces the merge-candidate
 * report the spec's Feature 4 calls for. Run: npx tsx scripts/audit-catalog-lines.ts
 *
 * This script performs SELECT reads only. It never writes to the
 * database. Every proposed fix is emitted as SQL text in the report
 * for Dave to review and run by hand, one entry at a time.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface CatalogRow {
  id:               string;
  brand:            string | null;
  series:           string | null;
  format:           string | null;
  ring_gauge:       number | null;
  length_inches:    number | null;
  wrapper:          string | null;
  shade:            string | null;
  wrapper_country:  string | null;
  binder_country:   string | null;
  filler_countries: string[] | null;
  usage_count:      number | null;
}

interface SeriesGroup {
  brand:       string;
  series:      string; // "" for null/brand-only series
  seriesLabel: string; // original series text, or "(none)" for display
  rows:        CatalogRow[];
}

/* ------------------------------------------------------------------
   Trigram similarity — mirrors Postgres pg_trgm semantics closely
   enough for report purposes: lowercase, pad with two leading spaces
   and one trailing space, extract 3-grams, similarity = |A∩B| / |A∪B|.
   ------------------------------------------------------------------ */

function trigrams(input: string): Set<string> {
  const padded = `  ${input.toLowerCase()} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;

  let intersectionSize = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersectionSize++;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/* ------------------------------------------------------------------
   Fetch — paginate by 1000 via .range() until a short page
   ------------------------------------------------------------------ */

const PAGE_SIZE = 1000;
const SELECT_COLUMNS =
  "id, brand, series, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count";

async function fetchAllRows(): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("cigar_catalog")
      .select(SELECT_COLUMNS)
      .range(from, to);

    if (error) {
      throw new Error(`Fetch failed at range ${from}-${to}: ${error.message}`);
    }

    const page = (data ?? []) as unknown as CatalogRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/* ------------------------------------------------------------------
   Grouping — brand + series (coalesced to "" for brand-only lines)
   ------------------------------------------------------------------ */

function groupRows(rows: CatalogRow[]): Map<string, SeriesGroup> {
  const groups = new Map<string, SeriesGroup>();

  for (const row of rows) {
    const brand = row.brand ?? "";
    const series = row.series ?? "";
    const key = `${brand} ${series}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        brand,
        series,
        seriesLabel: row.series ?? "(none)",
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  return groups;
}

/* ------------------------------------------------------------------
   Section A — prefix/superset series pairs within the same brand
   ------------------------------------------------------------------ */

interface PrefixPair {
  brand:   string;
  shorter: SeriesGroup;
  longer:  SeriesGroup;
}

function findPrefixPairs(groupsByBrand: Map<string, SeriesGroup[]>): PrefixPair[] {
  const pairs: PrefixPair[] = [];

  for (const [brand, groups] of groupsByBrand) {
    const withSeries = groups.filter((g) => g.series !== "");

    for (let i = 0; i < withSeries.length; i++) {
      for (let j = 0; j < withSeries.length; j++) {
        if (i === j) continue;
        const a = withSeries[i];
        const b = withSeries[j];
        // a is a word-prefix of b: b.startsWith(a + " ")
        if (b.series.toLowerCase().startsWith(a.series.toLowerCase() + " ")) {
          pairs.push({ brand, shorter: a, longer: b });
        }
      }
    }
  }

  return pairs;
}

/* ------------------------------------------------------------------
   Section B — trigram near-matches >= 0.87 within the same brand
   ------------------------------------------------------------------ */

const TRIGRAM_THRESHOLD = 0.87;

interface TrigramMatch {
  brand: string;
  a:     SeriesGroup;
  b:     SeriesGroup;
  score: number;
}

function findTrigramMatches(groupsByBrand: Map<string, SeriesGroup[]>): TrigramMatch[] {
  const matches: TrigramMatch[] = [];

  for (const [brand, groups] of groupsByBrand) {
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        const labelA = `${brand} ${a.series}`.trim();
        const labelB = `${brand} ${b.series}`.trim();
        const score = trigramSimilarity(labelA, labelB);
        if (score >= TRIGRAM_THRESHOLD) {
          matches.push({ brand, a, b, score });
        }
      }
    }
  }

  return matches;
}

/* ------------------------------------------------------------------
   Section C — blend-conflict groups (children disagree on blend fields)
   ------------------------------------------------------------------ */

function blendFingerprint(row: CatalogRow): string {
  return JSON.stringify({
    wrapper:          row.wrapper ?? "",
    shade:            row.shade ?? "",
    wrapper_country:  row.wrapper_country ?? "",
    binder_country:   row.binder_country ?? "",
    filler_countries: [...(row.filler_countries ?? [])].sort(),
  });
}

function findBlendConflicts(groups: SeriesGroup[]): SeriesGroup[] {
  return groups.filter((group) => {
    if (group.rows.length < 2) return false;
    const fingerprints = new Set(group.rows.map(blendFingerprint));
    return fingerprints.size > 1;
  });
}

/* ------------------------------------------------------------------
   Section D — data health
   ------------------------------------------------------------------ */

interface DataHealth {
  totalRows:        number;
  totalGroups:      number;
  nullFormat:       number;
  nullRingGauge:    number;
  nullLengthInches: number;
  nullBrand:        number;
}

function computeDataHealth(rows: CatalogRow[], groupCount: number): DataHealth {
  return {
    totalRows:        rows.length,
    totalGroups:      groupCount,
    nullFormat:       rows.filter((r) => r.format === null).length,
    nullRingGauge:    rows.filter((r) => r.ring_gauge === null).length,
    nullLengthInches: rows.filter((r) => r.length_inches === null).length,
    nullBrand:        rows.filter((r) => r.brand === null).length,
  };
}

/* ------------------------------------------------------------------
   SQL helpers
   ------------------------------------------------------------------ */

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function mergeSql(brand: string, keepSeries: string, dropSeries: string): string {
  const b = escapeSql(brand);
  const keep = escapeSql(keepSeries);
  const drop = escapeSql(dropSeries);

  return [
    `-- Merge '${b} / ${drop}' into '${b} / ${keep}'`,
    "update cigar_catalog set",
    `  line_id = (select id from cigar_lines where brand = '${b}' and coalesce(series,'') = '${keep}'),`,
    `  series  = nullif('${keep}', '')`,
    `where brand = '${b}' and coalesce(series, '') = '${drop}';`,
    "delete from cigar_lines",
    `where brand = '${b}' and coalesce(series, '') = '${drop}'`,
    "  and not exists (select 1 from cigar_catalog c where c.line_id = cigar_lines.id);",
    "-- Verify:",
    `-- select count(*) from cigar_catalog where brand = '${b}' and coalesce(series,'') = '${drop}';  -- 0`,
    "-- select count(*) from humidor_items;  -- unchanged",
  ].join("\n");
}

/* ------------------------------------------------------------------
   Report rendering
   ------------------------------------------------------------------ */

function groupSummary(group: SeriesGroup): string {
  const sampleNames = group.rows
    .slice(0, 3)
    .map((r) => r.format ?? "(no format)")
    .join(", ");
  return `${group.rows.length} row(s) — sample formats: ${sampleNames}`;
}

function renderSectionA(pairs: PrefixPair[]): string {
  if (pairs.length === 0) {
    return "No prefix/superset series pairs found.\n";
  }

  const lines: string[] = [];
  for (const [index, pair] of pairs.entries()) {
    lines.push(`### A.${index + 1} — ${pair.brand}: '${pair.shorter.series}' vs '${pair.longer.series}'`);
    lines.push("");
    lines.push(`- Group 1: \`${pair.brand} / ${pair.shorter.series}\` — ${groupSummary(pair.shorter)}`);
    lines.push(`- Group 2: \`${pair.brand} / ${pair.longer.series}\` — ${groupSummary(pair.longer)}`);
    lines.push("");
    lines.push(
      `**Proposed action:** merge '${pair.longer.series}' into '${pair.shorter.series}' (the longer series name looks like a vitola/size variant appended to the base series name). Confirm against catalog context before running.`
    );
    lines.push("");
    lines.push("```sql");
    lines.push(mergeSql(pair.brand, pair.shorter.series, pair.longer.series));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

function renderSectionB(matches: TrigramMatch[]): string {
  if (matches.length === 0) {
    return "No trigram near-matches at or above the 0.87 threshold.\n";
  }

  const lines: string[] = [];
  for (const [index, match] of matches.entries()) {
    lines.push(
      `### B.${index + 1} — ${match.brand}: '${match.a.seriesLabel}' vs '${match.b.seriesLabel}' (similarity ${match.score.toFixed(3)})`
    );
    lines.push("");
    lines.push(`- Group 1: \`${match.brand} / ${match.a.seriesLabel}\` — ${groupSummary(match.a)}`);
    lines.push(`- Group 2: \`${match.brand} / ${match.b.seriesLabel}\` — ${groupSummary(match.b)}`);
    lines.push("");
    lines.push(
      "**Proposed action:** leave distinct unless manual review confirms these are the same line under a spelling/formatting variant. If confirmed, merge the smaller group into the larger one:"
    );
    lines.push("");
    const [keep, drop] =
      match.a.rows.length >= match.b.rows.length ? [match.a, match.b] : [match.b, match.a];
    lines.push("```sql");
    lines.push(mergeSql(match.brand, keep.series, drop.series));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

function renderSectionC(conflicts: SeriesGroup[]): string {
  if (conflicts.length === 0) {
    return "No blend-conflict groups found.\n";
  }

  const lines: string[] = [];
  lines.push(
    "These groups have children that disagree on wrapper, shade, wrapper_country, binder_country, or filler_countries. They are the backfill's untouched-copy groups: the parent `cigar_lines` row was stamped from an arbitrary child, so the parent's blend fields may not represent every child. No SQL is proposed here — each needs a manual decision on which blend is authoritative."
  );
  lines.push("");

  for (const [index, group] of conflicts.entries()) {
    lines.push(`### C.${index + 1} — ${group.brand} / ${group.seriesLabel}`);
    lines.push("");
    lines.push(`- ${group.rows.length} children, distinct blend fingerprints found`);
    for (const row of group.rows) {
      lines.push(
        `  - \`${row.id}\`: wrapper=${row.wrapper ?? "null"}, shade=${row.shade ?? "null"}, wrapper_country=${row.wrapper_country ?? "null"}, binder_country=${row.binder_country ?? "null"}, filler_countries=${(row.filler_countries ?? []).join("/") || "null"}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderSectionD(health: DataHealth): string {
  return [
    `- Total catalog rows: ${health.totalRows}`,
    `- Total brand+series groups: ${health.totalGroups}`,
    `- Rows with null \`format\`: ${health.nullFormat}`,
    `- Rows with null \`ring_gauge\`: ${health.nullRingGauge}`,
    `- Rows with null \`length_inches\`: ${health.nullLengthInches}`,
    `- Rows with null \`brand\`: ${health.nullBrand}`,
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------
   Main
   ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("Fetching cigar_catalog rows (read-only)...");
  const rows = await fetchAllRows();
  console.log(`Fetched ${rows.length} rows.`);

  const groupsMap = groupRows(rows);
  const allGroups = [...groupsMap.values()];

  const groupsByBrand = new Map<string, SeriesGroup[]>();
  for (const group of allGroups) {
    const list = groupsByBrand.get(group.brand) ?? [];
    list.push(group);
    groupsByBrand.set(group.brand, list);
  }

  const prefixPairs = findPrefixPairs(groupsByBrand);
  const trigramMatches = findTrigramMatches(groupsByBrand);
  const blendConflicts = findBlendConflicts(allGroups);
  const dataHealth = computeDataHealth(rows, allGroups.length);

  const generatedAt = new Date().toISOString();

  const report = [
    "# Catalog Lines Audit — Merge Candidate Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "This is a read-only audit. Nothing in this report has been applied to the database. Every proposed merge below is edit-in-place: it repoints `cigar_catalog.line_id` to the surviving `cigar_lines` row and rewrites the `series` text column. Child row ids never change, and `humidor_items` rows are untouched (they reference `humidor_items.cigar_id`, not `line_id` or `series`). Review each entry and run its SQL by hand, one at a time, verifying with the accompanying verify queries before moving to the next.",
    "",
    "**Pre-apply probe:** run `select count(*) from cigar_catalog where series = '';` before applying any merge SQL below. A nonzero count means the catalog has literal empty-string `series` values coexisting with NULL `series` — the ''-vs-null split needs resolving before merges, since every merge above matches groups on `coalesce(series, '')` and would otherwise conflate the two.",
    "",
    "## Section A — Same-brand series word-prefix pairs",
    "",
    "One series name is a word-prefix of another within the same brand (e.g. 'Hemingway' vs 'Hemingway Short Story'). Classic sign of a vitola or size variant that was seeded as its own series.",
    "",
    renderSectionA(prefixPairs),
    "## Section B — Trigram near-matches (similarity >= 0.87)",
    "",
    "Same-brand series pairs whose text is nearly identical by trigram similarity (spelling variants, punctuation differences, casing). Threshold mirrors Postgres `pg_trgm` semantics: lowercase, pad with two leading spaces and one trailing space, 3-grams, `|A∩B| / |A∪B|`.",
    "",
    renderSectionB(trigramMatches),
    "## Section C — Blend-conflict groups",
    "",
    renderSectionC(blendConflicts),
    "## Section D — Data health",
    "",
    renderSectionD(dataHealth),
  ].join("\n");

  const reportDir = path.resolve(process.cwd(), "docs/reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "2026-09-06-catalog-lines-audit.md");
  fs.writeFileSync(reportPath, report, "utf-8");

  console.log(
    `A: ${prefixPairs.length} prefix pairs, B: ${trigramMatches.length} near-matches, C: ${blendConflicts.length} conflicts, D: ${dataHealth.nullFormat} format nulls, ${dataHealth.nullRingGauge} ring nulls, ${dataHealth.nullLengthInches} length nulls, ${dataHealth.nullBrand} brand nulls (${dataHealth.totalRows} rows, ${dataHealth.totalGroups} groups)`
  );
  console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
