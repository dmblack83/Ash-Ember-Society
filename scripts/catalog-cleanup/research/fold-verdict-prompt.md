# Fold verdict research (one batch)

You are given ONE batch file `research/targets/folds-NN.json`, shaped `{ "batch": "folds-NN", "targets": [ ... ] }`. Each entry in `targets` is a catalog "fold target" and has two cigar lines from the same brand, `a` and `b`, with their vitolas (sizes). Decide, from published sources, whether they are the same product line.

For `kind: "fold"`: `a` is a line whose series name extends `b`'s by `remainder` (for example "Blackened S84" extends "Blackened"). Answer `fold` if the remainder is a size, vitola, wrapper, or edition suffix of the SAME line (a's cigars belong under b). Answer `keep` if the remainder names a distinct line or sub-brand that the maker markets separately (its own page, own blend, own name). Answer `unsure` if the sources do not settle it.

For `kind: "near_dupe"`: `a` and `b` have similar series names (typo, abbreviation, spelling). Answer `merge_a_into_b` or `merge_b_into_a` when they are the same line and one spelling is the maker's; put the maker's spelling as the target (the one that survives). Answer `keep` if they are genuinely different lines. `unsure` otherwise.

Rules:
- Search the maker's own site first, then one retailer or database. Cite every page you relied on in `urls`. A verdict with no url is discarded.
- Never guess from the name alone. If you cannot open a page that mentions both names, answer `unsure`.
- Set "model" to the family name you are running as, in lowercase: fable, opus, sonnet, or haiku.
- Do not modify the catalog. Do not write anything except the output file.

Output: write ONE file `<outDir>/research/verdicts/<batch>-<model>.json` (for example `research/verdicts/folds-01-opus.json`, using the `batch` value from the input) shaped exactly:
{ "model": "<your model name>", "batch": "<batch>", "verdicts": [ { "targetId": "<id from the input>", "answer": "fold|keep|merge_a_into_b|merge_b_into_a|unsure", "reason": "<one sentence>", "urls": ["https://..."] } ] }
Every entry in the input `targets` gets exactly one verdict. Reply with only the output path and counts per answer.
