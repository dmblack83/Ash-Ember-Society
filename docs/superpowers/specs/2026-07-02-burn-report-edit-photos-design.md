# Burn-report edit: full photo management

**Date:** 2026-07-02
**Status:** Approved by Dave (approach + scope confirmed in session)
**Supersedes:** the v1 "photos cannot be changed when editing" rule and the
read-only per-third photo display shipped in PR #549.

## Goal

Editing a burn report must let the user add, remove, and replace photos —
both the main photo row (up to 3 photos) and each third's photo slot —
with the same behavior the create wizard has. "Editing should show the
current state and let you change the parts you want."

## Decisions made

- **Full manage** (add / remove / replace), not replace-only. (Dave)
- **Both surfaces**: main photo row and per-third slots. (Dave)
- **Approach 1 — edit adapter**: edit mode gets its own photo state; the
  create flow's data model (`form.photo_files: File[]`, `thirdPhotos`)
  and behavior are untouched. Unifying both modes on one photo model is
  explicitly out of scope (candidate later refactor, own PR). (Dave)
- **No storage deletion**: replaced/removed photos stay in the bucket.
  Shared lounge posts and generated share images may reference old URLs;
  orphaned objects are harmless, broken images are not. (engineering)

## Edit-mode photo model (new, edit-only)

```ts
type EditPhoto =
  | { kind: "kept"; url: string }   // already-uploaded photo, by URL
  | { kind: "new";  file: File };   // freshly picked, uploads on save

editPhotos:      EditPhoto[]                                   // ordered, max 3; order = final photo_urls order
editThirdPhotos: [EditPhoto | null, EditPhoto | null, EditPhoto | null]
```

- Initialized from `existing.photo_urls` (kept entries) and
  `existing.third_photo_urls`. A third's entry is the SAME object as its
  main-list entry (matched by URL at init), so identity linkage works
  exactly like create's File-identity linkage.
- Removing a main photo that is also a third's photo clears that third's
  slot (mirror of create's `handleRemovePhoto`).
- Adding a photo inside a third's sheet appends it to the main list
  (mirror of create's shared-list sync), subject to the 3-photo cap.
- Cap: 3 total (kept + new). Add affordances hide when full, including
  inside the third's sheet.
- Degenerate data: if a third's saved URL is not present in
  `photo_urls` (should not happen — create always syncs them — but old
  or hand-edited rows may exist), the third slot still shows it as a
  standalone kept entry; it does not join the main list.

Pure helpers (unit-testable, no React):
- `initEditPhotos(photoUrls, thirdPhotoUrls)` → `{ editPhotos, editThirdPhotos }`
- `removeEditPhoto(state, index)` → new state with third linkage cleared
- `buildPhotoPatch(state, uploadedUrlByFile)` → `{ photo_urls, third_photo_urls }`

## UI changes

- **Main row (Step 3, edit mode):** the read-only thumbnail row and its
  "photos cannot be changed when editing" caption are replaced by the
  same grid interaction create has: thumbnail + remove ×, Add buttons on
  empty slots, instant preview for new picks. Kept photos preview via
  their URL; new picks via `URL.createObjectURL`.
- **PerThirdSheet:** the `photoReadOnly` prop from #549 is removed. The
  sheet's photo slot accepts an initial value that is either a kept URL
  or a new File, and supports add / remove / replace in both modes. Its
  save payload carries the photo as
  `{ kind: "kept", url } | { kind: "new", file } | null`; the create-mode
  caller maps this back to the existing `photo_file` semantics so create
  behavior is unchanged.

## Save path (edit)

1. Compress and upload each `kind: "new"` photo via the existing
   pipeline (`compressImage` → `POST /api/upload/image`, folder
   `burn-reports`) — same code create uses, including the iOS 4.5 MB
   mitigation.
2. Build the final arrays with `buildPhotoPatch`:
   - `photo_urls: string[]` in `editPhotos` order (empty array = user
     removed all photos; a valid state).
   - per-third `photo_url: string | null` resolved onto each entry of
     the existing `thirds` payload.
3. One JSON PATCH as today, extended (below).
4. Failure modes match create: offline/failed upload surfaces an error
   and nothing is written (uploads that succeeded before a PATCH failure
   are orphaned storage objects — acceptable, same as create).

## API changes (`PATCH /api/burn-report/[id]`)

- `BurnReportEditBody` gains `photo_urls?: string[]` → `assign("photo_urls")`
  onto the smoke_logs update (present = write, absent = untouched).
- Each `thirds[]` entry gains optional `photo_url: string | null`.
  - When the key is **present**, write it.
  - When **absent**, keep today's preserve-by-index snapshot behavior.
  This keeps older cached app builds (which send no photo fields) safe:
  their edits continue to preserve photos exactly as before.

## Out of scope

- Deleting replaced photos from storage (orphans accepted).
- Draft persistence for edit mode (edit has no drafts today; unchanged).
- Outbox replay for photo uploads (multipart unsupported there; same
  limitation as create).
- Unifying create + edit on one photo model (later refactor, own PR).

## Testing

- Unit (TDD): the three pure helpers — init from existing (incl. URL→slot
  third matching), removal clears linked third, cap enforcement, patch
  assembly (kept-only, new-only, mixed, all-removed, third add/replace/
  remove).
- Gate: tsc, tsc sw, build, full unit suite.
- Manual (Dave, post-deploy): on a report with photos + thirds — replace
  a main photo, remove one, add one, replace a third's photo from inside
  the sheet, save, confirm detail view and lounge share reflect it and
  create flow still works.
