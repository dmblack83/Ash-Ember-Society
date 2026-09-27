# Catalog cleanup executor

Bulk catalog cleanup for production, run from this machine through the Supabase
Management API with a disposable token. Spec:
`docs/superpowers/specs/2026-09-26-catalog-cleanup-executor-design.md`.

## Before every session

1. Mint a personal access token at https://supabase.com/dashboard/account/tokens.
2. Export it for the shell only (never write it to a file):
   `export SUPABASE_MGMT_TOKEN=sbp_...`
3. Revoke it when the session's runs are done.

Outputs (ops files, previews, receipts) land in `.catalog-cleanup-out/` (git-ignored).
Keep the receipts: they are the undo.

## First run (pass 1)

```
npx tsx scripts/catalog-cleanup/executor.ts probe-txn        # once: proves a batch is one transaction
npx tsx scripts/catalog-cleanup/executor.ts refs             # real reference counts -> refs.json
npx tsx scripts/catalog-cleanup/gen-tier-a.ts                # -> ops-tier-a.json + deferred.json
npx tsx scripts/catalog-cleanup/executor.ts preview .catalog-cleanup-out/ops-tier-a.json
#   read preview.md; approve the rules; then
npx tsx scripts/catalog-cleanup/executor.ts execute .catalog-cleanup-out/ops-tier-a.json
npx tsx scripts/catalog-cleanup/gen-format-name.ts           # -> ops-format-name.json
npx tsx scripts/catalog-cleanup/executor.ts preview .catalog-cleanup-out/ops-format-name.json
npx tsx scripts/catalog-cleanup/executor.ts execute .catalog-cleanup-out/ops-format-name.json
```

Then apply `supabase/migrations/20260909_line_identity_normalize.sql` through the same
channel: run its probe (expect 0 rows), apply, run its verify block.

## Undo

```
npx tsx scripts/catalog-cleanup/executor.ts undo .catalog-cleanup-out/receipt-<runId>.json
```

Refuses uncommitted receipts. If member rows moved since the run it stops and lists
them; `--force` proceeds without repointing those rows.

## Op types

fold_line, rename_line, update_vitola, merge_vitola, write_name. See
`lib/catalog-cleanup/types.ts`. Unreviewed ops never touch community-added lines or
vitolas with real references (humidor items or smoke logs); set `reviewed: true` on an
op only after a human looked at it.
