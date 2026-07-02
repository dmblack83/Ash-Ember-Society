# Burn-Report Edit Photo Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full add/remove/replace photo management in burn-report edit mode (main row + per-third slots), with the create flow's behavior untouched.

**Architecture:** Edit mode gets its own photo state built on a pure `EditPhoto` union (`kept` URL | `new` File) in a new `lib/burn-report/edit-photos.ts` module that mirrors create's shared-list invariant (`photos = [thirds' photos, then manual-only], cap 3`). New files upload through the existing `compressImage` → `/api/upload/image` pipeline before a single JSON PATCH that now carries `photo_urls` plus per-third `photo_url`. Spec: `docs/superpowers/specs/2026-07-02-burn-report-edit-photos-design.md`.

**Tech Stack:** Next.js App Router, React 19, Supabase (PostgREST + storage), vitest.

## Global Constraints

- Never break the create flow: `form.photo_files: File[]`, `thirdPhotos`, the sync effect (BurnReport.tsx:1721-1731), `handleRemovePhoto`, and the create submit path must behave byte-for-byte as today.
- PATCH backward compatibility: a body with NO photo fields must behave exactly as today (photo_urls untouched, per-third photo_url preserved by index snapshot).
- No storage deletions.
- Cap: 3 photos total (kept + new), including adds from inside a third's sheet.
- No em dashes in user-facing strings.
- Gate before every commit: `npx tsc --noEmit` && `npx tsc --noEmit -p tsconfig.sw.json` && `npm run build` && `npm run test:unit` (155 tests green baseline; run the full gate at least at Task 4/5; tsc + targeted tests suffice between micro-steps).

---

### Task 1: Pure edit-photo state module

**Files:**
- Create: `lib/burn-report/edit-photos.ts`
- Test: `lib/burn-report/__tests__/edit-photos.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3-4):

```ts
export type EditPhoto =
  | { kind: "kept"; url: string }
  | { kind: "new"; file: File };
export type EditThirds = [EditPhoto | null, EditPhoto | null, EditPhoto | null];

export function initEditPhotos(
  photoUrls: string[],
  thirdPhotoUrls: [string | null, string | null, string | null],
): { photos: EditPhoto[]; thirds: EditThirds };

export function reconcileEditPhotos(thirds: EditThirds, photos: EditPhoto[]): EditPhoto[];

export function removeEditPhoto(
  photos: EditPhoto[], thirds: EditThirds, index: number,
): { photos: EditPhoto[]; thirds: EditThirds };

export function buildPhotoPatch(
  photos: EditPhoto[],
  thirds: EditThirds,
  uploadedUrlByFile: Map<File, string>,
): { photo_urls: string[]; third_photo_urls: [string | null, string | null, string | null] };
```

Semantics (mirror of create, BurnReport.tsx:1715-1748):
- `initEditPhotos`: one `kept` object per URL in `photoUrls` order; `thirds[i]` references the SAME object when `thirdPhotoUrls[i]` matches a main-list URL (first match); an unmatched third URL becomes a fresh `kept` object in the tuple only (reconcile merges it into the list).
- `reconcileEditPhotos`: `[...thirds non-null in tuple order, ...photos not present in thirds (by object identity)].slice(0, 3)`. Returns the input `photos` array unchanged (same reference) when the result is element-wise identical, so the caller's effect can cheaply no-op.
- `removeEditPhoto`: drops `photos[index]`; if that object is in `thirds` (identity), nulls that tuple slot.
- `buildPhotoPatch`: `kept` → its url; `new` → `uploadedUrlByFile.get(file)`, throwing `new Error("missing uploaded URL for new photo")` if absent. Applies to both the list and the tuple.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/burn-report/__tests__/edit-photos.test.ts
import { describe, expect, test } from "vitest";
import {
  initEditPhotos, reconcileEditPhotos, removeEditPhoto, buildPhotoPatch,
  type EditPhoto, type EditThirds,
} from "../edit-photos";

const fileA = new File(["a"], "a.jpg", { type: "image/jpeg" });

describe("initEditPhotos", () => {
  test("builds kept entries in order and links thirds by identity", () => {
    const { photos, thirds } = initEditPhotos(
      ["u1", "u2", "u3"], ["u2", null, "u3"],
    );
    expect(photos.map((p) => p.kind === "kept" && p.url)).toEqual(["u1", "u2", "u3"]);
    expect(thirds[0]).toBe(photos[1]);   // identity, not equality
    expect(thirds[1]).toBeNull();
    expect(thirds[2]).toBe(photos[2]);
  });

  test("unmatched third URL becomes a tuple-only kept entry", () => {
    const { photos, thirds } = initEditPhotos(["u1"], ["orphan", null, null]);
    expect(photos).toHaveLength(1);
    expect(thirds[0]).toEqual({ kind: "kept", url: "orphan" });
    expect(photos).not.toContain(thirds[0]);
  });
});

describe("reconcileEditPhotos", () => {
  test("thirds first, then manual-only, capped at 3", () => {
    const t1: EditPhoto = { kind: "kept", url: "t1" };
    const m1: EditPhoto = { kind: "kept", url: "m1" };
    const m2: EditPhoto = { kind: "kept", url: "m2" };
    const m3: EditPhoto = { kind: "kept", url: "m3" };
    const thirds: EditThirds = [t1, null, null];
    const result = reconcileEditPhotos(thirds, [m1, m2, m3]);
    expect(result).toEqual([t1, m1, m2]); // m3 trimmed by cap
  });

  test("returns the same array reference when nothing changes", () => {
    const t1: EditPhoto = { kind: "kept", url: "t1" };
    const m1: EditPhoto = { kind: "kept", url: "m1" };
    const photos = [t1, m1];
    const thirds: EditThirds = [t1, null, null];
    expect(reconcileEditPhotos(thirds, photos)).toBe(photos);
  });

  test("merges an orphan third entry into the list (self-heal)", () => {
    const orphan: EditPhoto = { kind: "kept", url: "orphan" };
    const m1: EditPhoto = { kind: "kept", url: "m1" };
    expect(reconcileEditPhotos([orphan, null, null], [m1])).toEqual([orphan, m1]);
  });
});

describe("removeEditPhoto", () => {
  test("removes from list and clears the linked third slot", () => {
    const { photos, thirds } = initEditPhotos(["u1", "u2"], ["u2", null, null]);
    const next = removeEditPhoto(photos, thirds, 1);
    expect(next.photos.map((p) => p.kind === "kept" && p.url)).toEqual(["u1"]);
    expect(next.thirds).toEqual([null, null, null]);
  });

  test("leaves unlinked thirds alone", () => {
    const { photos, thirds } = initEditPhotos(["u1", "u2"], ["u2", null, null]);
    const next = removeEditPhoto(photos, thirds, 0);
    expect(next.photos.map((p) => p.kind === "kept" && p.url)).toEqual(["u2"]);
    expect(next.thirds[0]).toBe(thirds[0]);
  });
});

describe("buildPhotoPatch", () => {
  test("maps kept URLs and uploaded new files, list and tuple", () => {
    const kept: EditPhoto = { kind: "kept", url: "u1" };
    const fresh: EditPhoto = { kind: "new", file: fileA };
    const { photo_urls, third_photo_urls } = buildPhotoPatch(
      [kept, fresh], [fresh, null, null], new Map([[fileA, "https://cdn/new.jpg"]]),
    );
    expect(photo_urls).toEqual(["u1", "https://cdn/new.jpg"]);
    expect(third_photo_urls).toEqual(["https://cdn/new.jpg", null, null]);
  });

  test("all photos removed produces empty array and null tuple", () => {
    expect(buildPhotoPatch([], [null, null, null], new Map())).toEqual({
      photo_urls: [], third_photo_urls: [null, null, null],
    });
  });

  test("throws when a new file has no uploaded URL", () => {
    const fresh: EditPhoto = { kind: "new", file: fileA };
    expect(() => buildPhotoPatch([fresh], [null, null, null], new Map())).toThrow(
      /missing uploaded URL/,
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/burn-report/__tests__/edit-photos.test.ts`
Expected: FAIL — cannot resolve `../edit-photos`.

- [ ] **Step 3: Implement `lib/burn-report/edit-photos.ts`**

```ts
/* ------------------------------------------------------------------
   Edit-mode photo state for the burn-report wizard.

   Create mode tracks photos as in-memory Files; edit mode must mix
   already-uploaded photos (URLs) with fresh picks (Files). This
   module is the pure core: the same shared-list invariant create
   uses (thirds' photos first, then manual-only, capped at 3), over a
   union that can hold either. React wiring stays in BurnReport.tsx.
   ------------------------------------------------------------------ */

export type EditPhoto =
  | { kind: "kept"; url: string }
  | { kind: "new"; file: File };

export type EditThirds = [EditPhoto | null, EditPhoto | null, EditPhoto | null];

export const MAX_PHOTOS = 3;

export function initEditPhotos(
  photoUrls: string[],
  thirdPhotoUrls: [string | null, string | null, string | null],
): { photos: EditPhoto[]; thirds: EditThirds } {
  const photos: EditPhoto[] = photoUrls.map((url) => ({ kind: "kept", url }));
  const thirds = thirdPhotoUrls.map((url) => {
    if (!url) return null;
    /* Same object as the main-list entry so identity linkage works
       (mirror of create's File-identity between thirdPhotos and
       photo_files). Unmatched URLs get a tuple-only entry; the first
       reconcile merges it into the list (self-heal). */
    return photos.find((p) => p.kind === "kept" && p.url === url)
      ?? { kind: "kept" as const, url };
  }) as EditThirds;
  return { photos, thirds };
}

export function reconcileEditPhotos(thirds: EditThirds, photos: EditPhoto[]): EditPhoto[] {
  const fromThirds = thirds.filter((p): p is EditPhoto => p !== null);
  const manualOnly = photos.filter((p) => !fromThirds.includes(p));
  const merged = [...fromThirds, ...manualOnly].slice(0, MAX_PHOTOS);
  const unchanged =
    merged.length === photos.length && merged.every((p, i) => p === photos[i]);
  return unchanged ? photos : merged;
}

export function removeEditPhoto(
  photos: EditPhoto[],
  thirds: EditThirds,
  index: number,
): { photos: EditPhoto[]; thirds: EditThirds } {
  const target = photos[index];
  const nextThirds = thirds.map((p) => (p === target ? null : p)) as EditThirds;
  return {
    photos: photos.filter((_, i) => i !== index),
    thirds: nextThirds,
  };
}

export function buildPhotoPatch(
  photos: EditPhoto[],
  thirds: EditThirds,
  uploadedUrlByFile: Map<File, string>,
): { photo_urls: string[]; third_photo_urls: [string | null, string | null, string | null] } {
  const resolve = (p: EditPhoto): string => {
    if (p.kind === "kept") return p.url;
    const url = uploadedUrlByFile.get(p.file);
    if (!url) throw new Error("missing uploaded URL for new photo");
    return url;
  };
  return {
    photo_urls:       photos.map(resolve),
    third_photo_urls: thirds.map((p) => (p ? resolve(p) : null)) as [
      string | null, string | null, string | null,
    ],
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/burn-report/__tests__/edit-photos.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add lib/burn-report/edit-photos.ts lib/burn-report/__tests__/edit-photos.test.ts
git commit -m "feat: pure edit-photo state module for burn-report edit"
```

---

### Task 2: PATCH API accepts photo fields

**Files:**
- Modify: `app/api/burn-report/[id]/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 4's save path): PATCH body accepts
  `photo_urls?: string[]` (written to smoke_logs only when the key is
  present) and per-third `photo_url?: string | null` (written when the
  key is present on that entry; preserved-by-index snapshot otherwise).

- [ ] **Step 1: Extend `BurnReportEditBody`**

In the interface (route.ts ~line 40-52), add after `content_video_id`:

```ts
  /* Full replacement photo list. Key present = write (empty array =
     user removed every photo); key absent = leave untouched (older
     app builds never send it). */
  photo_urls?: string[];
```

and change the thirds entry type from
`thirds?: Array<PerThirdData & { index: 1 | 2 | 3 }>;` to:

```ts
  thirds?: Array<PerThirdData & {
    index: 1 | 2 | 3;
    /* Key present = write this third's photo (null clears it); key
       absent = preserve the existing photo_url by index (pre-photo-
       editing clients). */
    photo_url?: string | null;
  }>;
```

- [ ] **Step 2: Write photo_urls onto the smoke_logs update**

After `assign("content_video_id");` (route.ts ~line 136), add:

```ts
  assign("photo_urls");
```

- [ ] **Step 3: Per-third photo_url present/absent semantics**

In the `thirdsRows` mapping (route.ts ~line 220-230), change

```ts
      photo_url:           photoByIndex.get(t.index) ?? null,
```

to:

```ts
      photo_url:           "photo_url" in t ? t.photo_url ?? null : photoByIndex.get(t.index) ?? null,
```

(The `photoByIndex` snapshot code above it stays — it is the
backward-compatibility path.)

- [ ] **Step 4: Gate + commit**

```bash
npx tsc --noEmit
npm run test:unit
git add "app/api/burn-report/[id]/route.ts"
git commit -m "feat: burn-report PATCH accepts photo_urls + per-third photo_url"
```

---

### Task 3: PerThirdSheet full photo management in both modes

**Files:**
- Modify: `components/humidor/PerThirdSheet.tsx`
- Modify: `components/humidor/BurnReport.tsx` (only the PerThirdSheet invocation + create-mode onSave mapping — the edit-mode mapping lands in Task 4)

**Interfaces:**
- Consumes: `EditPhoto` shape conceptually (but the sheet keeps its own local union to stay decoupled).
- Produces (consumed by Task 4):
  - Props: `initialPhoto?: File | null` (create), `initialPhotoUrl?: string | null` (edit kept photo). `photoReadOnly` is REMOVED.
  - `SaveLocalPayload` gains `photo_kept_url: string | null` alongside the existing `photo_file?: File | null`. Exactly one of the two is non-null when a photo is present; both null = no photo.

- [ ] **Step 1: Replace the sheet's photo state**

In `PerThirdSheet.tsx`, replace the `photo` state and the `photoReadOnly`/read-only render branch (added in PR #549) with a single union:

```ts
type SheetPhoto = { kind: "file"; file: File } | { kind: "url"; url: string } | null;
```

```ts
  const [photo, setPhoto] = useState<SheetPhoto>(
    initialPhoto ? { kind: "file", file: initialPhoto }
    : initialPhotoUrl ? { kind: "url", url: initialPhotoUrl }
    : null,
  );
```

Props block: delete `photoReadOnly?: boolean;` and its destructure default; keep `initialPhotoUrl?: string | null` with default `null`.

- [ ] **Step 2: Restore ONE photo render branch (both modes identical)**

Delete the entire `photoReadOnly ? (...) : (...)` ternary from #549 and restore the single interactive block, with the preview handling both kinds:

```tsx
            {/* Photo */}
            <div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--paper-mute)", margin: "0 0 6px" }}>
                Photo
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto({ kind: "file", file: f });
                }}
              />
              {photo ? (
                <div style={{ position: "relative", width: 96, aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line-strong)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.kind === "file" ? URL.createObjectURL(photo.file) : photo.url}
                    alt="Per-third photo"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", color: "#fff", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                /* existing Add button unchanged */
```

(The Add button block and everything after it stay exactly as before #549's ternary; only the closing `)}` structure returns to its original single-conditional shape.)

- [ ] **Step 3: Extend the save payload**

In `SaveLocalPayload`, change `photo_file?: File | null;` to:

```ts
  photo_file:     File | null;
  photo_kept_url: string | null;
```

In the Save button's `onSave` call, replace `photo_file: photo,` with:

```ts
                photo_file:     photo?.kind === "file" ? photo.file : null,
                photo_kept_url: photo?.kind === "url"  ? photo.url  : null,
```

- [ ] **Step 4: Update the BurnReport invocation (create mapping only)**

In `BurnReport.tsx`, at the `<PerThirdSheet` invocation: remove the `photoReadOnly={isEdit}` prop (leave `initialPhotoUrl` — Task 4 rewires its value). The existing create-mode onSave line `nextPhotos[openThird - 1] = payload.photo_file ?? null;` keeps working unchanged (kept URLs never occur in create because `initialPhotoUrl` is null there).

- [ ] **Step 5: Gate + commit**

```bash
npx tsc --noEmit
npm run test:unit
git add components/humidor/PerThirdSheet.tsx components/humidor/BurnReport.tsx
git commit -m "feat: PerThirdSheet photo slot supports kept URLs + full manage"
```

---

### Task 4: BurnReport edit wiring — state, grid, save path

**Files:**
- Modify: `components/humidor/BurnReport.tsx`

**Interfaces:**
- Consumes: Task 1's module, Task 2's PATCH contract, Task 3's payload.

- [ ] **Step 1: Edit photo state**

Next to the existing `thirdPhotos` state (~line 1513), add:

```ts
  /* Edit-mode photo state — kept URLs + new Files under the same
     shared-list invariant create uses. Only read when isEdit. */
  const [editPhotoState, setEditPhotoState] = useState<{ photos: EditPhoto[]; thirds: EditThirds }>(
    () => isEdit && existing
      ? initEditPhotos(existing.photo_urls, existing.third_photo_urls)
      : { photos: [], thirds: [null, null, null] },
  );
```

with imports:

```ts
import {
  initEditPhotos, reconcileEditPhotos, removeEditPhoto, buildPhotoPatch,
  MAX_PHOTOS, type EditPhoto, type EditThirds,
} from "@/lib/burn-report/edit-photos";
```

Add the edit-mode reconcile effect directly after create's sync effect (~line 1731):

```ts
  /* Edit-mode mirror of the sync effect above, over EditPhoto slots. */
  useEffect(() => {
    if (!isEdit) return;
    setEditPhotoState((prev) => {
      const merged = reconcileEditPhotos(prev.thirds, prev.photos);
      return merged === prev.photos ? prev : { ...prev, photos: merged };
    });
  }, [isEdit, editPhotoState.thirds]);
```

- [ ] **Step 2: Route the Step-3 photo grid through mode-aware props**

The Overall step component currently takes `hidePhotos` + `existingPhotoUrls` (read-only branch, ~lines 966-1006) and renders the interactive grid from `form.photo_files` (~lines 1008-1090). Change its contract to a display list:

- Delete the `hidePhotos`/`existingPhotoUrls` props, the read-only block, and the "Photos cannot be changed when editing" caption.
- New props:

```ts
  photoPreviews: { key: string; src: string }[];   // rendered slots, max 3
  onRemovePhoto: (i: number) => void;               // unchanged name
  onAddPhoto:    (file: File) => void;              // replaces direct form access
```

- The grid maps `photoPreviews[i]` instead of `form.photo_files[i]` (`<img src={photoPreviews[i].src}>`), keeps the same remove button wired to `onRemovePhoto(i)`, and the file input's onChange calls `onAddPhoto(file)`.

Parent wiring (both modes render the SAME grid):

```ts
  const photoPreviews = isEdit
    ? editPhotoState.photos.map((p, i) => ({
        key: p.kind === "kept" ? p.url : `new-${i}`,
        src: p.kind === "kept" ? p.url : URL.createObjectURL(p.file),
      }))
    : form.photo_files.map((f, i) => ({ key: `f-${i}`, src: URL.createObjectURL(f) }));

  const handleAddPhoto = useCallback((file: File) => {
    if (isEdit) {
      setEditPhotoState((prev) =>
        prev.photos.length >= MAX_PHOTOS ? prev
        : { ...prev, photos: [...prev.photos, { kind: "new", file }] });
    } else {
      update({ photo_files: [...form.photo_files, file].slice(0, 3) });
    }
  }, [isEdit, form.photo_files, update]);

  const handleRemovePhotoEditAware = useCallback((i: number) => {
    if (isEdit) {
      setEditPhotoState((prev) => removeEditPhoto(prev.photos, prev.thirds, i));
    } else {
      handleRemovePhoto(i);
    }
  }, [isEdit, handleRemovePhoto]);
```

The create-mode `onAddPhoto` body must replicate exactly what the current file-input handler does today (read it before replacing; if it differs from the simple append above, keep the existing behavior verbatim and only route it through the new prop).

- [ ] **Step 3: Rewire the PerThirdSheet invocation for edit**

```tsx
          initialPhoto={
            isEdit
              ? (editPhotoState.thirds[openThird - 1]?.kind === "new"
                  ? (editPhotoState.thirds[openThird - 1] as { kind: "new"; file: File }).file
                  : null)
              : thirdPhotos[openThird - 1]
          }
          initialPhotoUrl={
            isEdit && editPhotoState.thirds[openThird - 1]?.kind === "kept"
              ? (editPhotoState.thirds[openThird - 1] as { kind: "kept"; url: string }).url
              : null
          }
```

And in onSave, after the existing thirds/notes handling, replace the create-only photo line with mode-aware mapping:

```ts
            if (isEdit) {
              setEditPhotoState((prev) => {
                const current = prev.thirds[openThird - 1];
                let nextPhoto: EditPhoto | null = null;
                if (payload.photo_file) {
                  /* Reuse the existing object when the file is unchanged
                     so identity linkage survives a no-op save. */
                  nextPhoto = current?.kind === "new" && current.file === payload.photo_file
                    ? current
                    : { kind: "new", file: payload.photo_file };
                } else if (payload.photo_kept_url) {
                  nextPhoto = current?.kind === "kept" && current.url === payload.photo_kept_url
                    ? current
                    : { kind: "kept", url: payload.photo_kept_url };
                }
                const nextThirds = [...prev.thirds] as EditThirds;
                nextThirds[openThird - 1] = nextPhoto;
                return { ...prev, thirds: nextThirds };
              });
            } else {
              const nextPhotos = [...thirdPhotos];
              nextPhotos[openThird - 1] = payload.photo_file ?? null;
              setThirdPhotos(nextPhotos);
            }
```

- [ ] **Step 4: Save path — upload new files, extend the PATCH payload**

Generalize the uploader (~line 1807): `async function uploadPhotos(files: File[]): Promise<string[]>` with the loop over `files`; the create submit call site becomes `uploadPhotos(form.photo_files)`.

In `handleSaveEdit`, after validation and before building `payload`:

```ts
    const newFiles = editPhotoState.photos
      .filter((p): p is { kind: "new"; file: File } => p.kind === "new")
      .map((p) => p.file);
    let uploadedUrlByFile = new Map<File, string>();
    try {
      const uploaded = await uploadPhotos(newFiles);
      uploadedUrlByFile = new Map(newFiles.map((f, i) => [f, uploaded[i]]));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Photo upload failed.");
      setSubmitting(false);
      return;
    }
    const { photo_urls, third_photo_urls } = buildPhotoPatch(
      editPhotoState.photos, editPhotoState.thirds, uploadedUrlByFile,
    );
```

Then in the payload object add `photo_urls,` and in the `sendThirds` mapping add per-entry:

```ts
        photo_url: third_photo_urls[i],
```

- [ ] **Step 5: Full gate + commit**

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.sw.json && npm run build && npm run test:unit
git add components/humidor/BurnReport.tsx
git commit -m "feat: full photo management in burn-report edit mode"
```

---

### Task 5: Review, push, PR

- [ ] **Step 1:** `scripts/review-package <branch-base> HEAD`, dispatch code-reviewer (opus) with the spec + plan paths; fix Critical/Important findings, re-review.
- [ ] **Step 2:** Pre-push check `gh pr list --head feat/burn-report-edit-photos --state all`, push, `gh pr create` with test plan including Dave's manual checks (replace/remove/add main photo; replace third photo from sheet; save; verify detail + lounge; verify create flow unchanged).
