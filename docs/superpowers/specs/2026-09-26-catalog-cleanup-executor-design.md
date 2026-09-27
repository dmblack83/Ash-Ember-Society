# Catalog Cleanup Executor — Design

**Date:** 2026-09-26
**Status:** Draft for Dave's review
**Supersedes:** the per-row approve/veto flow of `mockups/catalog-cleanup-review/index.html` as the primary path (the page stays as an optional generator input; Dave chose to restart as if no decisions were recorded)

## 1. Purpose

Apply catalog cleanup changes to production in bulk so Dave approves **rules and exceptions**, not individual cigars. Every run previews first, executes atomically, and leaves a receipt that can undo it. The first real run is the **rules pass** (Tier A); later passes reuse the same executor with different generators.

Success: after pass 1, the 3 case-dupe lines, the Tier-A wrapper-noise folds, the 9 identical-composition vitola pairs, and the ~950 splittable format→name rows are fixed in prod with zero member inventory touched, and PR #614's line-identity migration is applied on top. Dave's time spent: four rule approvals from sample previews, not 5,000 rows.

## 2. Constraints (given)

- Vitola identity = full composition (name + format + dims + wrapper/shade). Never dedupe by name alone.
- Wrapper-variant folds are automatic only for **seeded** (not community-added) lines with **zero real references**. Named remainders (possible sub-brands, e.g. L'Atelier La Mission) are never automatic.
- Row ids never change. Line folds repoint children; vitola merges go through `merge_catalog_vitolas` (repoints humidor/smoke/suggestion/photo refs, then deletes the source).
- `SUPABASE_SERVICE_ROLE_KEY` is scrubbed from this machine. The privileged channel is the Supabase **Management API** `POST /v1/projects/{ref}/database/query` with a **disposable personal access token** Dave mints at supabase.com/dashboard/account/tokens and revokes after the run. The SQL editor is not used (it mangles complex plpgsql; see memory `reference_supabase_sql_editor_midline_semicolons`).
- `usage_count` is NOT a reference count (Path A adds don't bump it). "Real references" = rows in `humidor_items` + `smoke_logs` whose `cigar_id` points at the vitola.
- No em dashes in anything user-facing. This tooling is internal; previews are for Dave only.

## 3. Architecture

```
generators/*.mjs  ──►  ops.json  ──►  executor.mjs ──preview──►  preview.md
                                          │
                                          ├──execute──►  receipt.json  (+ prod changes, one transaction)
                                          │
                                          └──undo <receipt>──►  reverse ops, one transaction
```

Location: `scripts/catalog-cleanup/` (committed; replaces the untracked `.catalog-audit-v2.tmp.mjs` / `.format-analysis.tmp.mjs` / `.research-targets.tmp.mjs` in the repo root, which are deleted once their logic moves in).

```
scripts/catalog-cleanup/
├── lib/
│   ├── mgmt-client.mjs      # Management API query channel (token, project ref, SQL in / rows out)
│   ├── catalog-read.mjs     # fetch lines + vitolas + real reference counts
│   ├── ops.mjs              # op schema, validation, canonical SQL per op type
│   ├── preview.mjs          # precondition checks + markdown rendering
│   └── receipt.mjs          # snapshot affected rows, build undo ops
├── generators/
│   ├── rules-tier-a.mjs     # pass 1: case-dupe lines, wrapper-noise folds, identical vitola pairs
│   ├── rules-format-name.mjs# pass 1: format→name split
│   └── review-export.mjs    # optional: mockups page export v3 → ops (kept for later passes)
├── executor.mjs             # CLI: preview | execute | undo | refs
└── README.md
```

Tests: `tests/unit/catalog-cleanup/*.test.ts` (vitest, already the repo's unit runner) on `ops`, `preview`, `receipt`, and both rule generators, against fixture rows. No test touches prod.

## 4. Operations file

`ops.json`:

```json
{
  "version": 1,
  "generatedAt": "2026-09-26T…",
  "generator": "rules-tier-a",
  "ops": [ …one of the five types below… ]
}
```

Every op has `{ "type", "reason", "generator", "reviewed": false }` plus type-specific fields. `reviewed: true` marks an op Dave explicitly approved despite a real reference; the executor refuses unreviewed ops that touch referenced rows (section 6).

| type | fields | prod effect (mirrors admin routes) |
|---|---|---|
| `fold_line` | `sourceLineId`, `targetLineId`, `childFills: { <vitolaId>: { shade?, wrapper? } }` | `cigar_catalog set line_id=target, brand=target.brand, series=target.series where line_id=source`; apply `childFills` only where the child's field is null; `delete from cigar_lines where id=source` |
| `rename_line` | `lineId`, `brand`, `series` | `update cigar_lines set brand, series` (trigger fans out). Target collision → the generator must emit `fold_line` instead; executor rejects a rename that collides (precondition) |
| `update_vitola` | `vitolaId`, `fields: { name?, format?, ring_gauge?, length_inches?, shade?, wrapper?, wrapper_country?, binder_country?, filler_countries? }` | `update cigar_catalog set … where id` (same field whitelist and validation ranges as `app/api/admin/catalog-sizes/[id]/route.ts`) |
| `merge_vitola` | `sourceVitolaId`, `targetVitolaId` | `select merge_catalog_vitolas(source, target)` |
| `write_name` | `vitolaId`, `name`, `confidence?`, `sourceUrl?` | `update cigar_catalog set name where id and name is null` (never overwrites an existing name; a non-null name is a precondition failure, not a silent skip) |

`write_name` is a narrow `update_vitola` kept separate so AI-name passes get their own precondition (null only) and their own preview bucket.

## 5. Executor CLI

```
node scripts/catalog-cleanup/executor.mjs refs                      # real reference counts → refs.json + summary
node scripts/catalog-cleanup/executor.mjs preview ops.json          # → preview.md (no writes)
node scripts/catalog-cleanup/executor.mjs execute ops.json          # → receipt-<ts>.json, then applies
node scripts/catalog-cleanup/executor.mjs undo receipt-<ts>.json    # reverses that run
```

Token and project ref come from env at run time: `SUPABASE_MGMT_TOKEN` (pasted per session, never written to `.env.local`) and `SUPABASE_PROJECT_REF` (may live in `.env.local`; it is not a secret). The executor refuses to start `execute`/`undo` without a token and prints the revoke URL when it finishes.

`execute` always runs `preview` first and aborts on any precondition failure. It never applies a partial run: all ops in one `begin … commit` inside a single Management API request; any error rolls everything back and the receipt is discarded (a receipt only exists for a committed run).

Output files land in the session scratchpad by default (`--out <dir>` to override) so nothing generated lands in the repo by accident.

## 6. Preview and preconditions

`preview` fetches the current rows for every id in `ops.json` (one query per table, batched by id) and the real reference counts, then checks:

- every referenced line / vitola id exists;
- `fold_line`: target exists, source ≠ target, source is `community_added = false` unless `reviewed`, every source child has zero real refs unless `reviewed`, and no `childFills` would overwrite a non-null field;
- `rename_line`: no existing line matches `lower(btrim(brand)), lower(btrim(coalesce(series,'')))` (this is the #614 identity; using it now keeps pass 1 compatible with the migration that follows);
- `update_vitola`: field whitelist + ranges (20–90 ring, 0–12 length, string lengths);
- `merge_vitola`: both rows exist, same `line_id`, source has zero real refs unless `reviewed` (the RPC repoints refs safely, but an unreviewed merge of a referenced row still needs Dave's eyes per his rule);
- `write_name`: current `name is null`;
- no id appears in two ops that would conflict (a row folded and updated in the same run is allowed; a row merged away and then updated is not).

Any failure → preview lists it under **Blocked** with the op and the reason, exit code 1. `execute` will not run while Blocked is non-empty.

`preview.md` layout: summary counts by op type; per type a table of up to 20 sample rows showing before → after (brand / series / name / format / dims / wrapper / shade); the Blocked list; the real-reference summary (how many touched rows have refs, all of which must carry `reviewed`). This file is what Dave reads to approve a **rule**; approving = telling Claude to run `execute`.

## 7. Receipt and undo

Before the transaction, `receipt.mjs` snapshots the full current row for every `cigar_lines` and `cigar_catalog` id an op touches, plus, for `merge_vitola`, the ids of `humidor_items`, `smoke_logs`, `cigar_edit_suggestions`, `cigar_image_submissions` rows currently pointing at the source. The receipt stores `{ runId, executedAt, opsFile, ops, snapshots }`.

`undo` derives reverse ops from the snapshots:

| forward | reverse |
|---|---|
| `fold_line` | re-insert the deleted `cigar_lines` row with its original id and fields; repoint the children back (`line_id`, `brand`, `series`); clear any `childFills` values written |
| `rename_line` | update back to the snapshot values |
| `update_vitola` / `write_name` | update back to the snapshot values |
| `merge_vitola` | re-insert the source `cigar_catalog` row with its original id and fields; repoint the recorded reference rows back to the source; restore the target's `usage_count` and `image_url` from the target snapshot |

Undo runs as one transaction too, and writes its own receipt (so an undo can be re-done). Undo of a `merge_vitola` is only exact if no member touched the merged rows between execute and undo; the undo preview reports any reference rows that no longer match the receipt and requires `--force` to proceed past them.

## 8. Pass 1 generators (the rules Dave approves)

Both generators read prod through `catalog-read.mjs` (lines, vitolas, real refs) and emit `ops.json` + a short console summary. They do not read the mockup page.

**`rules-tier-a`** (ports the Tier-A logic of the audit v2 script verbatim, plus reference counts):

- R1 **Case/whitespace duplicate lines**: same `lower(btrim(brand)) + lower(btrim(coalesce(series,'')))`. Keep the line with the most vitolas; emit `fold_line` for each other. (3 expected.)
- R2 **Wrapper-noise folds**: series = parent series + only tokens from the noise set `{nt, md, natural, maduro, cameroon, connecticut, broadleaf, sungrown, sun grown, habano, corojo, oscuro, claro}`; source line seeded; every child has zero real refs. Emit `fold_line` with `childFills` that carry the noise token into the child as `shade` (`nt`/`natural` → Natural, `md`/`maduro` → Maduro, `oscuro`, `claro`) or `wrapper` (`cameroon`, `connecticut`, `broadleaf`, `habano`, `corojo`, `sungrown`/`sun grown` → Sun Grown), **only where the child's field is null**. A child whose existing `wrapper`/`shade` conflicts with the token makes the whole fold non-automatic (dropped from pass 1, listed in the summary for the fold-verdict pass). This keeps the wrapper distinction that the series suffix was carrying.
- R3 **Identical-composition vitola pairs**: same line, same `norm(name) | format | ring | length | norm(wrapper) | norm(shade)`. Keep the row with the highest `usage_count`, emit `merge_vitola` for each other. (9 expected.)

Everything Tier B (named remainders, near-dupe series, community-added, any real refs) is **not emitted**; it is written to `deferred.json` with the audit's `flaggedWhy` so the fold-verdict pass (step 4 of the cleanup sequence) starts from it.

**`rules-format-name`**:

- Input: nameless vitolas whose `format` is not in `FORMATS` (from `lib/cigar-taxonomy.ts`) but **contains** a canonical token of length > 3.
- Rule (as proposed 2026-09-19, for Dave to confirm from the preview sample): `name` = the full current format label, `format` = the longest contained canonical token (case-normalized to the taxonomy spelling). Emit one `update_vitola` per row with `{ name, format }`.
- Rows whose format contains no canonical token are not touched (listed as a count in the summary; they stay as they are, which is harmless).
- Community-added rows are included (a name write plus a format normalization does not change identity), but are marked in the preview so Dave can veto the class in one word.

## 9. Sequence for the first run

1. Dave mints a token; `refs` reports real reference counts (answers the open risk: if referenced rows are many, pass 1 shrinks and the residue grows).
2. `rules-tier-a` → `preview` → Dave approves R1/R2/R3 from the samples → `execute` → receipt.
3. `rules-format-name` → `preview` → Dave confirms the rule from the samples → `execute` → receipt.
4. Apply `supabase/migrations/20260909_line_identity_normalize.sql` through the same channel: run its probe (expect 0 rows now that R1 is done), apply, run its verify block.
5. Dave revokes the token.

Steps 2–3 are separate runs on purpose: one receipt per rule family keeps undo scoped.

## 10. Error handling

- Management API errors (401, 403, 5xx, network) abort with the HTTP status and body; nothing is retried automatically (a retried write could double-apply).
- SQL errors inside the transaction roll it back; the executor prints the failing statement index and the Postgres message.
- A preview that finds zero ops exits 0 with "nothing to do".
- Receipts are written to disk **before** the transaction is sent and marked `committed: true` only after the API confirms; an uncommitted receipt is ignored by `undo` and flagged on the next `preview`.

## 11. Testing

- Unit (vitest): op validation (every type, every rejection); preview preconditions against fixture rows including each Blocked case; receipt → reverse-op derivation for all four reversible types; R1/R2/R3 and format→name generators against a fixture catalog that includes the known tricky cases (Perdomo six "Maduro" vitolas must NOT merge; "Hemingway Best Seller NT" folds with shade fill; "L'Atelier La Mission" is deferred; a child with conflicting wrapper blocks its fold).
- SQL rendering: snapshot tests of the generated SQL per op type.
- Integration: one `preview` against prod before the first `execute` (read-only), reviewed by Dave. No automated test writes to prod.

## 12. Pass 2: web-verified passes (same executor)

Dave approved web research as part of this effort (2026-09-26). Pass 2 has two generators that read `deferred.json` and the catalog, research on the web, and emit ops with evidence. Dave reviews only what the evidence cannot settle.

**Evidence on ops.** Every op may carry `evidence: [{ "url", "quote", "fetchedAt" }]` and `agreement: { "modelA", "modelB" }`. `preview.md` shows the first evidence URL beside each sample row so an approval is checkable in one click.

**`verify-folds`** (the 155 named-remainder folds + 115 near-dupe series, minus anything pass 1 already resolved):

1. For each candidate, fetch the brand's own product page and one retailer listing (search by brand + series). The question is factual: is the remainder a sub-brand / distinct line, or a size or wrapper suffix of the parent?
2. Two independent model passes (Fable 5.1 and Opus 5.5), each given the fetched pages and the line's vitolas, each answering fold / keep / unsure with a one-line reason.
3. Emit automatically only when **both sources support the same answer and both models agree**, the source line is seeded, and every child has zero real refs. Fold → `fold_line` (with `proposedVitolaName` written to the children as `write_name` when the remainder names a vitola); keep → no op, recorded as resolved-keep in `verdicts.json`.
4. Everything else (disagreement, no usable source, community-added, real refs) goes to `review.json` with both models' reasons and the URLs. That file is Dave's entire review for this pass; his answers are applied by re-running the generator with `--verdicts review.json` which emits the ops with `reviewed: true`.
5. QA gate: 10% random sample of the auto bucket is included in `preview.md` marked "QA sample". One wrong item in the sample drops the whole auto bucket back to `review.json`.

**`name-vitolas`** (all remaining unnamed vitolas, all brands, one pass; replaces the chunk-by-10 plan):

1. Per line, fetch the brand page and one retailer page listing the line's sizes; match each catalog vitola by dims (±1/8 inch, exact ring) to a published size name.
2. Emit `write_name` with `confidence` (high = both sources list the same name for those dims; medium = one source; low = model inference only) and `sourceUrl`.
3. The executor applies high only (`--min-confidence high`). Medium and low are written to `names-pending.json` for the community review queue (later work), not for Dave.
4. Dims mismatches found on the way (our ring/length vs both sources) are appended to `dims-flags.json`, joining the 29 already parked; they become `update_vitola` ops only when both sources agree, in their own run.
5. Spot-check: 20 random high-confidence names per run appear in `preview.md` with their URLs.

Research runs as parallel subagents (batches of ~10 brands, as in chunk 1), read-only on the web, writing only into the scratchpad. Rate: chunk 1 hit 92% named at ~10 brands per batch; the whole catalog is ~71 brands, so one session.

## 13. Out of scope

- Lazy cleanup trigger in the community review queue (consumes `names-pending.json` later).
- Applying the dims flags: their own small run once two sources agree; no new machinery.
