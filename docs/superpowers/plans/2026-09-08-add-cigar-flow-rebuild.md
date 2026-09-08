# Add-Cigar Flow Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One unified add-cigar sheet (line-grouped search → in-sheet vitola picker → one-tap save) serving every entry point: humidor add, catalog detail, band scanner, wishlist.

**Architecture:** New `components/cigars/add-flow/` component family hosts a three-state sheet (search / vitola picker / save) plus the unchanged manual path. The old `AddCigarSheet`, `AddToHumidorSheet`, and `AddWishlistSheet` internals retire; entry points migrate to the one sheet. The scanner keeps its camera/OCR pipeline and hands its line-grouped matches to the same sheet. Search rides the existing `get_catalog_lines` RPC (`fetchCatalogLines`); the vitola list rides `fetchLineSiblings`.

**Tech Stack:** Next.js App Router, SWR, Supabase client reads, vitest.

**Design authority:** `docs/superpowers/specs/2026-09-08-add-cigar-flow-design.md` + `mockups/add-cigar-flow/index.html` (sections 01, 02, 04, 05, 07, 08). Implementation is transcription of the mockup's approved sections; 03 (manual slimming) NOT approved — manual form ships unchanged; 06 (browse quick-add) REJECTED.

## Global Constraints

- No em dashes in user-facing copy.
- Dims are ALWAYS length-first via shared helpers `sizeDims`/`sizeLabel` from `lib/cigars/line-group.ts` — never hand-rolled `"${ring} ring · ${len}\""` strings.
- Vitola label precedence: `name` → `format` → dims → "Original size" (that is `sizeLabel`'s existing logic; reuse it).
- Bottom-nav routes stay static shells; this work is all client components inside existing routes — no route may gain server data fetching. `npm run check:shells` must stay green.
- Draft persistence (`lib/cigars/cigar-draft.ts`) and the iOS-eviction restore pattern must survive on the manual path exactly as in today's `AddCigarSheet` (load on open, mirror on type, clear on explicit close/success).
- Behavior ports must preserve: free-tier `HumidorLimitError` → `UpgradeLimitModal`; usage-count bump on catalog-row adds; `ensureDefaultHumidor` fallback; dupe-check interstitial (`matchCigarLines` + `DupeCheckDialog`) on manual submit; toast messages verbatim from today's code.
- Gates per task: `npx tsc --noEmit`, `npm run test:unit`, eslint on touched files (pre-existing errors only). `npm run build` + `npm run check:shells` in the final task.
- Worktree note: this worktree needs `npm ci` + `.env.local` copied from the main checkout before the build gate (both already present in `.claude/worktrees/vitola-merge`).

## Setup (execution start)

- [ ] `git fetch origin main` and create branch `feat/add-cigar-unified-flow` off `origin/main` in the worktree. Commit the spec (`docs/superpowers/specs/2026-09-08-add-cigar-flow-design.md`, copy from the main checkout at `/Users/dave.black/Documents/the-humidor/docs/superpowers/specs/`) and this plan as `"docs: add-cigar flow rebuild spec + plan"`. If PR #614 has merged, `origin/main` already contains it; if not, note in the PR body that #614 should merge first (overlap: `lib/data/cigar-fetchers.ts`).

---

### Task 1: Extract shared VitolaRadioList from CigarDetailClient

**Files:**
- Create: `components/cigars/VitolaRadioList.tsx`
- Modify: `components/cigars/CigarDetailClient.tsx` (radiogroup block, ~lines 210-268 — the `role="radiogroup"` div mapping `siblings` to radio rows)

**Interfaces:**
- Produces:
```tsx
export interface VitolaRadioListProps {
  siblings:   SizeChild[];              // from lib/cigars/line-group
  selectedId: string | null;
  onSelect:   (id: string) => void;
  ariaLabel:  string;                    // "Choose Vitola"
}
export function VitolaRadioList(props: VitolaRadioListProps): JSX.Element
```

- [ ] **Step 1:** Read the current radiogroup JSX in `CigarDetailClient.tsx` (the block rendering `siblings.map(...)` with radio circles, name via `sizeLabel`-style precedence, mono dims right, gold selected ring). Move it VERBATIM into `VitolaRadioList.tsx` with the props above — visual output must be pixel-identical on the detail page. Keep the row label logic exactly as it is in the detail page today (name when present, format fallback, dims right via `sizeDims`).
- [ ] **Step 2:** Rewire `CigarDetailClient.tsx` to render `<VitolaRadioList siblings={siblings} selectedId={selectedId} onSelect={setSelectedId} ariaLabel="Choose Vitola" />` in place of the inline block. No other detail-page changes.
- [ ] **Step 3:** Gates. Commit `"refactor: extract VitolaRadioList (shared by detail page + add flow)"`.

---

### Task 2: SaveStep — one-tap save with collapsed purchase details

**Files:**
- Create: `components/cigars/add-flow/SaveStep.tsx`
- Create: `lib/cigars/add-flow-state.ts`
- Test: `lib/cigars/__tests__/add-flow-state.test.ts`

**Interfaces:**
- Produces (in `add-flow-state.ts`):
```ts
export interface SaveFormState {
  quantity:     number;        // 1
  purchaseDate: string;        // today ISO date
  priceStr:     string;        // ""
  source:       string;        // ""
  agingStart:   string;        // today
  agingTarget:  string;        // "" (AgingTargetSelect default handles 2_weeks)
  notes:        string;        // ""
  agingSynced:  boolean;       // true until user edits either date
}
export function emptySaveForm(today: string): SaveFormState
/* Purchase-date change: agingStart follows while agingSynced. */
export function setPurchaseDate(s: SaveFormState, date: string): SaveFormState
/* Aging-start change: breaks the sync. */
export function setAgingStart(s: SaveFormState, date: string): SaveFormState
```
- Produces (SaveStep):
```tsx
export interface SaveStepProps {
  mode:            "humidor" | "wishlist";
  form:            SaveFormState;
  onForm:          (next: SaveFormState) => void;
  humidors:        { id: string; name: string; is_default: boolean }[] | undefined;
  pickedHumidorId: string | null;
  onPickHumidor:   (id: string) => void;
  submitting:      boolean;
  submitError:     string | null;
  ctaLabel:        string;               // e.g. `Add to Humidor` / `Add 3 to Humidor`
  onSubmit:        () => void;
}
```

- [ ] **Step 1 (TDD):** Write `add-flow-state.test.ts`: `emptySaveForm` defaults; `setPurchaseDate` moves `agingStart` when synced; `setAgingStart` breaks sync so later `setPurchaseDate` leaves it alone. Run — FAIL (module missing).
- [ ] **Step 2:** Implement `add-flow-state.ts` (pure functions, immutable returns). Run — PASS.
- [ ] **Step 3:** Build `SaveStep.tsx` per mockup section 04: `mode === "humidor"` renders Quantity stepper (styling ported verbatim from `AddCigarSheet.tsx` quantity block) → humidor `<select>` (only when `humidors?.length >= 2`, ported from `AddCigarSheet`) → a closed-by-default expander button `Add purchase details` (dashed border per mockup `.expander`) that toggles the field stack: Purchase Date, Price Per Cigar, Source / Retailer, Start Aging, Ready to Smoke By (`AgingTargetSelect`, `defaultPreset="2_weeks"`), Notes — all field markup ported verbatim from `AddCigarSheet.tsx` (labels, `.input` classes, min-heights). Dates wire through `setPurchaseDate`/`setAgingStart`. `mode === "wishlist"` renders ONLY the Notes field (parity with today's wishlist add). Error + CTA blocks ported from `AddCigarSheet` (spinner CTA included).
- [ ] **Step 4:** Gates. Commit `"feat: SaveStep — collapsed purchase details with smart defaults (add flow)"`.

---

### Task 3: LineSearchPanel — line-grouped search

**Files:**
- Create: `components/cigars/add-flow/LineSearchPanel.tsx`

**Interfaces:**
- Consumes: `fetchCatalogLines({ query, pageIndex, pageSize })` (`lib/data/cigar-fetchers.ts:212`), `CatalogLine` (`lib/cigars/line-group.ts:12`), `Highlight` (`components/cigar-search.tsx` — move it in Task 8).
- Produces:
```tsx
export interface LineSearchPanelProps {
  initialQuery?: string;
  onPickLine:   (line: CatalogLine) => void;   // sheet decides picker vs skip
  onManual:     () => void;
  autoFocus?:   boolean;
}
```

- [ ] **Step 1:** Build the panel modeled on `components/cigar-search.tsx` (same 300ms debounce, popular-on-mount, click-outside dismiss, Load more, spinner) but each row renders a LINE per mockup 01: brand (caps, `var(--primary)`, `Highlight`ed), series (serif, `Highlight`ed), wrapper meta line when `line.wrapper` present, right-aligned vitola chip — `sizeCount > 1` → `"{n} vitolas"` gold chip; `sizeCount === 1` → muted `"1 vitola"`; `sizeCount === 0` (ungrouped fallback) → no chip. Data: `fetchCatalogLines` with `pageSize: 8` (`SEARCH_PAGE_SIZE` convention), popular default = `query: ""`, `pageIndex 0`, `pageSize 20`, header label "Popular Cigars". Keep BOTH "Can't find it? Add manually" placements (empty state + list footer) with today's exact copy.
- [ ] **Step 2:** `initialQuery` (scanner handoff): when set and non-empty, seed the input and run the search on mount instead of popular.
- [ ] **Step 3:** Gates. Commit `"feat: LineSearchPanel — line-grouped add-flow search"`.

---

### Task 4: VitolaPickerPanel

**Files:**
- Create: `components/cigars/add-flow/VitolaPickerPanel.tsx`

**Interfaces:**
- Consumes: `fetchLineSiblings(brand, series)` (`lib/data/cigar-fetchers.ts:251`), `VitolaRadioList` (Task 1), `sizeLabel`/`sizeDims`.
- Produces:
```tsx
export interface VitolaPickerPanelProps {
  brand:      string | null;
  series:     string | null;
  fromScan?:  boolean;                 // small mono tag on the line card
  onChange:   () => void;              // back to search
  onConfirm:  (child: SizeChild) => void;
}
```

- [ ] **Step 1:** Build per mockup 02: selected-line card (brand caps / serif series / "Change" button; `fromScan` renders a mono-caps "from scan" tag), then `<VitolaRadioList>` fed by SWR on `fetchLineSiblings` (key: reuse `keyFor.lineSiblings` if present in `lib/data/keys.ts`, else the existing convention `["line-siblings", brand, series ?? ""]` — check the detail page's key and reuse it), auto-select the first row, CTA `Add {sizeLabel(selected)}` calling `onConfirm(selected)`. Loading state: three skeleton rows (reuse the app's skeleton class conventions from the detail page). Error state: muted "Couldn't load sizes." + Change stays available.
- [ ] **Step 2:** Gates. Commit `"feat: VitolaPickerPanel — in-sheet Choose Vitola"`.

---

### Task 5: AddFlowSheet — the unified sheet

**Files:**
- Create: `components/cigars/add-flow/AddFlowSheet.tsx`
- Test: `lib/cigars/__tests__/add-flow-entry.test.ts` (pure reducer bits it exports)

**Interfaces:**
- Produces:
```tsx
export type AddFlowEntry =
  | { kind: "search"; query?: string }                    // humidor add; scanner no-match handoff
  | { kind: "line"; brand: string | null; series: string | null; fromScan?: boolean }
  | { kind: "vitola"; cigarId: string }                   // detail page, wishlist promote
  | { kind: "manual"; brand?: string };                   // scanner no-match manual

export interface AddFlowSheetProps {
  open:             boolean;
  entry:            AddFlowEntry;
  mode:             "humidor" | "wishlist";
  onClose:          () => void;
  onAdded:          (message?: string) => void;
  defaultHumidorId?: string | null;
}
export type AddFlowStage = "search" | "picker" | "manual" | "save";
export function stageForEntry(entry: AddFlowEntry): AddFlowStage  // exported for tests
```
- Consumes: Tasks 2-4 components; from `AddCigarSheet.tsx`: `finishInsert`/`createListingAndFinish`/dupe-check submit logic, draft effects, caret overlay, `BottomSheet` props; from `AddToHumidorSheet.tsx`: the existing-entry conflict flow (`ExistingItem` fetch on resolved cigar + "Already in Humidor" panel, add-to-existing vs new-entry actions ~lines 63-292); `fetchCigarDetail` for `entry.kind === "vitola"` header card.

- [ ] **Step 1 (TDD):** Test `stageForEntry`: search→"search", line→"picker", vitola→"save", manual→"manual". FAIL → implement → PASS.
- [ ] **Step 2:** Sheet shell: `BottomSheet` with `AddCigarSheet`'s exact chrome (title "Add Cigar", close button, caret overlay, `mobileHeight="calc(100dvh - 48px)"`, `desktopMaxWidth={640}`, `desktopHeight="80dvh"`, `surface="background"`). Stage state initialized via `stageForEntry(entry)` on open (reset-on-open effect mirrors `AddCigarSheet`'s, including draft restore → when a manual draft exists AND `entry.kind === "search"`, open in "manual" with the draft, exactly today's behavior).
- [ ] **Step 3:** Stage wiring:
  - "search": `LineSearchPanel` in the header slot (like today's `CigarSearch` placement). `onPickLine`: fetch siblings; `sizeCount === 1` or fetched length 1 → resolve that child, go "save"; else stash `{brand, series}`, go "picker". Ungrouped-fallback lines (`sizeCount 0`) resolve via their `repId` as the child id → "save".
  - "picker": `VitolaPickerPanel`; `onConfirm(child)` → resolved cigar = child, stage "save". `onChange` → "search".
  - "manual": existing `CigarDetailFields` + `nameRequired` + community note + "Back to search" — ported verbatim from `AddCigarSheet` manual block, drafts included. Manual submit runs today's dupe-check flow (`matchCigarLines` → `DupeCheckDialog` with the three outcomes) then insert, all ported.
  - "save": resolved-cigar card (brand caps + `CigarTitle` + `sizeDims` meta + Change → back to prior stage) above `SaveStep`. For `entry.kind === "vitola"` load the card via SWR `fetchCigarDetail`.
- [ ] **Step 4:** Conflict port: on entering "save" with a resolved catalog `cigarId` (NOT manual inserts), fetch existing non-wishlist `humidor_items` for that user+cigar (port the query and `ExistingItem` shape from `AddToHumidorSheet`). On submit with existing entries and conflict not yet shown → render the "Already in Humidor" panel (port markup + both actions: bump first entry's quantity vs insert new entry). Wishlist mode skips conflict entirely.
- [ ] **Step 5:** Submit paths: port `finishInsert` (humidor insert via `addHumidorItem` incl. `HumidorLimitError` → `UpgradeLimitModal`, usage bump, `ensureDefaultHumidor`, draft clear, toasts) and wishlist insert (from `WishlistClient`'s `finishWishlistInsert`: `quantity 1, is_wishlist: true`, notes only). Toast strings verbatim from their sources.
- [ ] **Step 6:** Gates. Commit `"feat: AddFlowSheet — unified add sheet (search / picker / save / manual)"`.

---

### Task 6: Humidor entry point migration

**Files:**
- Modify: `components/humidor/HumidorClient.tsx` (~1091-1110: `AddCigarOptions` + `AddCigarSheet` render)
- Delete: `components/humidor/AddCigarSheet.tsx`

- [ ] **Step 1:** Replace the `AddCigarSheet` dynamic import + render with `AddFlowSheet` (`entry={{ kind: "search" }}`, `mode="humidor"`, same `open/onClose/onAdded/defaultHumidorId` wiring). `AddCigarOptions` chooser unchanged.
- [ ] **Step 2:** Delete `AddCigarSheet.tsx`; grep repo-wide for `AddCigarSheet` — zero references must remain.
- [ ] **Step 3:** Gates. Commit `"feat: humidor add rides the unified AddFlowSheet"`.

---

### Task 7: Detail page + wishlist promote migration, retire AddToHumidorSheet

**Files:**
- Modify: `components/cigars/CigarActions.tsx` (~33-136)
- Modify: `components/humidor/WishlistClient.tsx` (promote wiring ~408, ~554-563)
- Delete: `components/cigars/AddToHumidorSheet.tsx`

- [ ] **Step 1:** `CigarActions`: swap `AddToHumidorSheet` for `AddFlowSheet` (`entry={{ kind: "vitola", cigarId }}`, `mode="humidor"`). Success/close/toast wiring preserved.
- [ ] **Step 2:** `WishlistClient` promote (`addCigarId`): same swap (`entry={{ kind: "vitola", cigarId: addCigarId }}`, `mode="humidor"`). The promote's existing post-add behavior (removing/keeping the wishlist row) is whatever today's `onSuccess` does — preserve it exactly.
- [ ] **Step 3:** Delete `AddToHumidorSheet.tsx` after grep shows the scanner reference is gone too IF Task 8 already landed; otherwise leave the file and delete in Task 8 (order note: Tasks 7 and 8 may land in either order; whichever lands second deletes the file).
- [ ] **Step 4:** Gates. Commit `"feat: detail + wishlist promote ride the unified AddFlowSheet"`.

---

### Task 8: Scanner handoff + wishlist add migration + retire old search

**Files:**
- Modify: `components/humidor/CigarBandScanner.tsx` (results block ~350-420, `AddToHumidorSheet` usage ~552-563)
- Create: `lib/scanner/group-matches.ts` + Test: `lib/scanner/__tests__/group-matches.test.ts`
- Modify: `components/humidor/WishlistClient.tsx` (its own add sheet → `AddFlowSheet` `mode="wishlist"`)
- Move: `Highlight` from `components/cigar-search.tsx` into `components/cigars/add-flow/LineSearchPanel.tsx` (or a tiny `highlight.tsx` beside it) and delete `components/cigar-search.tsx` once repo-wide grep shows zero `CigarSearch`/`CatalogResult` consumers (update importers of `CatalogResult` — it also lives as the scanner's match type; move the interface to `lib/data/cigar-fetchers.ts` if consumers remain).

**Interfaces:**
```ts
/* group-matches.ts */
import type { CatalogResult } from "@/lib/data/cigar-fetchers"; // post-move home
export interface LineMatchGroup {
  brand: string | null; series: string | null;
  children: CatalogResult[];        // scored order preserved
  topScoreIndex: number;            // index of best child in original ranking
}
export function groupMatchesByLine(matches: CatalogResult[]): LineMatchGroup[]
```

- [ ] **Step 1 (TDD):** `group-matches.test.ts`: groups by `(brand, coalesce(series,""))` preserving first-seen order; one group per line; children keep score order; empty input → empty. FAIL → implement → PASS.
- [ ] **Step 2:** Scanner results UI per mockup 08: map `groupMatchesByLine(matches)` — primary group renders as a line match card ("Match Found" headline stays; brand caps + serif series + `"{children.length} vitolas"` chip or the single child's `sizeLabel` when 1); further groups render as smaller muted rows; quiet link "None of these? Search instead". Tap behaviors: multi-child group → `AddFlowSheet` `entry={{ kind: "line", brand, series, fromScan: true }}`; single-child group → `entry={{ kind: "vitola", cigarId: children[0].id }}`. "Search instead" → `entry={{ kind: "search", query: bestBrandGuess }}` where `bestBrandGuess` = primary group's brand ?? first OCR query word. No-match phase buttons: "Search the catalog" → same search entry; "Add manually" → `entry={{ kind: "manual", brand: bestBrandGuess }}`. Camera, OCR, `matchCatalog`, `scoreCandidates` untouched.
- [ ] **Step 3:** `WishlistClient`'s own add flow: replace its `CigarSearch` + manual internals with `AddFlowSheet` (`entry={{ kind: "search" }}`, `mode="wishlist"`). Wishlist draft namespace ("wishlist") keeps working via the sheet's mode-aware draft key (mirror `AddCigarSheet`'s "humidor" vs "wishlist" draft keys — the unified sheet uses `mode` as the draft key).
- [ ] **Step 4:** Delete `AddToHumidorSheet.tsx` if Task 7 left it; delete `components/cigar-search.tsx` when orphaned; repo-wide grep for `CigarSearch`, `AddToHumidorSheet`, `AddCigarSheet` = zero.
- [ ] **Step 5:** Gates. Commit `"feat: scanner line-grouped handoff + wishlist add on the unified sheet; retire legacy sheets"`.

---

### Task 9: Full verification + PR

- [ ] `npm run test:unit`, `npx tsc --noEmit`, `npm run build`, `npm run check:shells` all green; eslint = pre-existing baseline only.
- [ ] Whole-branch code review (most capable model) + ONE fix wave + scoped re-review per SDD.
- [ ] verify-in-app interactive capture (extend the harness like the session's `capture-add-flow` script; creds from Dave): journeys = humidor Add → search "hemingway" shows line rows → tap line → picker → Add (collapsed) → row appears; single-vitola line skips picker; manual path with drafts + dupe dialog; detail-page add opens at save; wishlist promote; wishlist add (notes only); scanner results grouped + handoff; conflict panel on an already-tracked cigar; free-tier limit modal path unchanged (code-read is fine if the fixture is a member account).
- [ ] Push (pre-push PR-state check) + PR. Body: spec + mockup cited as authority; verdicts table (03 not approved, 06 rejected); note the retired components; deploy note NONE (no migrations); note #614 relationship.

## Self-review notes (done at plan time)

- Premises verified this session against the worktree: `fetchCatalogLines` signature + `p_search` (cigar-fetchers.ts:212-227), widened `fetchLineSiblings` select (:258), `AddToHumidorSheetProps` + conflict flow (:22-292), `AddCigarSheet` structure (full read), scanner `matchCatalog`/results phases, chooser labels ("Scan Cigar Band"/"Search Catalog").
- Lifecycle walk (AddFlowSheet): reset-on-open effect re-initializes stage from `entry` each open; draft restore only hijacks `search` entries into `manual` (today's exact behavior); `entry` changes while closed are picked up on next open (effect keyed on `open`); SWR caches for siblings persist across stage flips (fine — read-only).
- Type consistency: `SizeChild`/`CatalogLine` imported from `lib/cigars/line-group`; `CatalogResult`'s post-move home is named in Task 8.
- Route-weight: no route changes; all lazy-loaded client sheets (`next/dynamic` preserved at each entry point).
- Shell-conversion states: LineSearchPanel (loading spinner, empty "No results", error → empty list per today's catch), VitolaPickerPanel (skeleton, error line), SaveStep (submitting spinner, submitError) — all assigned above.
