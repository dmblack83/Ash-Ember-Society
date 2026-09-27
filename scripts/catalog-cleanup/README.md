# Catalog cleanup executor

Bulk catalog cleanup for production, run from this machine through the Supabase
Management API with a disposable token. Spec:
`docs/superpowers/specs/2026-09-26-catalog-cleanup-executor-design.md`.

## Before every session

1. Mint a personal access token at https://supabase.com/dashboard/account/tokens.
2. Enter it for this shell only, so it never lands in shell history or a file:
   `read -s SUPABASE_MGMT_TOKEN; export SUPABASE_MGMT_TOKEN`
   (paste the token at the silent prompt and press Enter).
3. Revoke it when the session's runs are done.

Outputs (ops files, previews, receipts) land in `.catalog-cleanup-out/` (git-ignored).
Every command, including the two generators, takes `--out <dir>` to use a different
folder; `--out` with no folder after it is refused. Keep the receipts: they are the undo.

## First run (pass 1)

1. Prove a batch is one transaction (once):

   ```
   npx tsx scripts/catalog-cleanup/executor.ts probe-txn [--out <dir>]
   ```

   It must print `transaction probe: rolled back`. Anything else: STOP, do not run
   execute, tell Claude.

2. Tier-A rules:

   ```
   npx tsx scripts/catalog-cleanup/executor.ts refs [--out <dir>]          # real reference counts -> refs.json
   npx tsx scripts/catalog-cleanup/gen-tier-a.ts [--out <dir>]              # -> ops-tier-a.json + deferred.json
   npx tsx scripts/catalog-cleanup/executor.ts preview .catalog-cleanup-out/ops-tier-a.json [--out <dir>]
   #   read preview.md; approve the rules; then
   npx tsx scripts/catalog-cleanup/executor.ts execute .catalog-cleanup-out/ops-tier-a.json [--out <dir>]
   ```

3. Format to name:

   ```
   npx tsx scripts/catalog-cleanup/gen-format-name.ts [--out <dir>]         # -> ops-format-name.json
   npx tsx scripts/catalog-cleanup/executor.ts preview .catalog-cleanup-out/ops-format-name.json [--out <dir>]
   npx tsx scripts/catalog-cleanup/executor.ts execute .catalog-cleanup-out/ops-format-name.json [--out <dir>]
   ```

4. Apply `supabase/migrations/20260909_line_identity_normalize.sql`. Claude does this
   through the same Management API channel; it is not a command in this tool. Claude
   runs its probe (expect 0 rows), applies it, and runs its verify block. Read the
   Undo section first: after this step, pass-1 line folds can no longer be undone.

## If execute errors after "sending N statements"

The batch may or may not have landed (for example the network dropped after the
database committed). Do not re-run execute. Run:

```
npx tsx scripts/catalog-cleanup/executor.ts confirm .catalog-cleanup-out/receipt-<runId>.json [--out <dir>]
```

It checks prod and tells you one of three things:

- the batch applied: the receipt becomes committed, and undo works on it;
- the batch did not apply: delete that receipt and re-run execute;
- a partial state: stop and get help. Nothing else should be run until it is understood.

Preview also warns about any uncommitted receipt it finds in the out folder.

## Undo

```
npx tsx scripts/catalog-cleanup/executor.ts undo .catalog-cleanup-out/receipt-<runId>.json [--force] [--out <dir>]
```

- Refuses uncommitted receipts (run confirm on them first).
- Skips rows edited since the run and lists them before doing anything. It also
  lists member rows (humidor items, smoke logs) that moved since the run. Either
  list stops the undo; `--force` proceeds anyway and leaves those rows as they are.
- Undo of pass-1 line folds is only possible BEFORE the 20260909 migration is
  applied: its unique index blocks re-inserting the case-duplicate lines.
- Redo means re-running the original ops file. An undo receipt cannot be undone.

## Op types

fold_line, rename_line, update_vitola, merge_vitola, write_name. See
`lib/catalog-cleanup/types.ts`. An unreviewed fold never touches a community-added
line or child, an unreviewed merge never touches a community-added or unapproved
vitola, and neither touches vitolas with real references (humidor items or smoke
logs). Set `reviewed: true` on an op only after a human looked at it.
