/* ------------------------------------------------------------------
   Edit-mode photo state for the burn-report wizard.

   Create mode tracks photos as in-memory Files; edit mode must mix
   already-uploaded photos (URLs) with fresh picks (Files). This
   module is the pure core: the same shared-list invariant create
   uses (thirds' photos first, then manual-only, capped at 3), over a
   union that can hold either. React wiring stays in BurnReport.tsx.

   Spec: docs/superpowers/specs/2026-07-02-burn-report-edit-photos-design.md
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
       photo_files). An unmatched URL gets a tuple-only entry; the
       first reconcile merges it into the list (self-heal). */
    return (
      photos.find((p) => p.kind === "kept" && p.url === url) ??
      ({ kind: "kept", url } as EditPhoto)
    );
  }) as EditThirds;
  return { photos, thirds };
}

export function reconcileEditPhotos(
  thirds: EditThirds,
  photos: EditPhoto[],
): EditPhoto[] {
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
): {
  photo_urls: string[];
  third_photo_urls: [string | null, string | null, string | null];
} {
  const resolve = (p: EditPhoto): string => {
    if (p.kind === "kept") return p.url;
    const url = uploadedUrlByFile.get(p.file);
    if (!url) throw new Error("missing uploaded URL for new photo");
    return url;
  };
  return {
    photo_urls: photos.map(resolve),
    third_photo_urls: thirds.map((p) => (p ? resolve(p) : null)) as [
      string | null,
      string | null,
      string | null,
    ],
  };
}
