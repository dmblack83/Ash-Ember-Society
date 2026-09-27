# Vitola naming research (one batch)

You are given a JSON batch of nameless cigar vitolas: brand, series, shape (`format`), ring gauge (`ring`), length in inches (`length`), wrapper and shade. Find the maker's published NAME for each size.

Method:
1. For each brand/series in the batch, open the maker's product page and one retailer or database page that lists the line's sizes with dimensions.
2. Match each vitola to a listed size by dimensions: ring exact, length within 1/8 inch. Read the size's published name (for example "Short Story", "Best Seller", "No. 4", "Toro Gordo").
3. Confidence: `high` when two different pages list the same name for those dimensions; `medium` when one page does; `low` when you inferred it (for example from a photo caption or a partial list). Never mark `high` with only one page.
4. If the published dimensions differ from ours by more than the tolerance, do NOT treat it as a match: add `dimsFlag` with the published `ring` and/or `length` and its `sourceUrl`, give the name you found, and the tool will hold it for review instead of writing it.
5. If no page names the size, set `name` to null with confidence `low` and say why in `note`.

Rules:
- The name must not be just the shape word again ("Robusto" for a Robusto is not a name; leave null unless the maker really calls the size "Robusto").
- Keep names under 60 characters, in the maker's spelling and capitalisation, without the brand or series prefix.
- Cite every page in `sourceUrls`. Do not write anything except the output file.
- Set "model" to the family name you are running as, in lowercase: fable, opus, sonnet, or haiku.

Output: write ONE file `<outDir>/research/names/<batch>-<model>.json` shaped:
{ "model": "<your model name>", "batch": "<batch>", "names": [ <one entry per vitola> ] }

Each entry, minimal form:
{ "vitolaId": "<id>", "name": "<name or null>", "confidence": "high|medium|low", "sourceUrls": ["https://..."] }

Add `note` only when you have something to say; add `dimsFlag` only when the published dimensions differ; otherwise omit both keys. Do not copy placeholder values from these examples.

Example entry WITH a dims flag (only for a size whose published dimensions differ from ours):
{ "vitolaId": "<id>", "name": "<name you found>", "confidence": "medium", "sourceUrls": ["https://..."], "note": "maker lists this size at a different ring", "dimsFlag": { "ring": <published ring>, "length": <published length>, "sourceUrl": "https://..." } }
Every vitola in the input gets exactly one entry. Reply with only the output path and counts per confidence.
