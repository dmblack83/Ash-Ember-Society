import { describe, expect, test } from "vitest";
import {
  initEditPhotos,
  reconcileEditPhotos,
  removeEditPhoto,
  buildPhotoPatch,
  type EditPhoto,
  type EditThirds,
} from "../edit-photos";

/* ------------------------------------------------------------------
   Edit-mode photo state — pure core. Mirrors the create flow's
   shared-list invariant (thirds' photos first, then manual-only,
   capped at 3) over kept-URL | new-File slots.
   ------------------------------------------------------------------ */

const fileA = new File(["a"], "a.jpg", { type: "image/jpeg" });

describe("initEditPhotos", () => {
  test("builds kept entries in order and links thirds by identity", () => {
    const { photos, thirds } = initEditPhotos(
      ["u1", "u2", "u3"],
      ["u2", null, "u3"],
    );

    expect(photos).toEqual([
      { kind: "kept", url: "u1" },
      { kind: "kept", url: "u2" },
      { kind: "kept", url: "u3" },
    ]);
    expect(thirds[0]).toBe(photos[1]); // identity, not just equality
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

    expect(result).toEqual([t1, m1, m2]); // m3 trimmed by the cap
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

    expect(next.photos).toEqual([{ kind: "kept", url: "u1" }]);
    expect(next.thirds).toEqual([null, null, null]);
  });

  test("leaves unlinked thirds alone", () => {
    const { photos, thirds } = initEditPhotos(["u1", "u2"], ["u2", null, null]);

    const next = removeEditPhoto(photos, thirds, 0);

    expect(next.photos).toEqual([{ kind: "kept", url: "u2" }]);
    expect(next.thirds[0]).toBe(thirds[0]);
  });
});

describe("buildPhotoPatch", () => {
  test("maps kept URLs and uploaded new files, list and tuple", () => {
    const kept: EditPhoto = { kind: "kept", url: "u1" };
    const fresh: EditPhoto = { kind: "new", file: fileA };

    const { photo_urls, third_photo_urls } = buildPhotoPatch(
      [kept, fresh],
      [fresh, null, null],
      new Map([[fileA, "https://cdn/new.jpg"]]),
    );

    expect(photo_urls).toEqual(["u1", "https://cdn/new.jpg"]);
    expect(third_photo_urls).toEqual(["https://cdn/new.jpg", null, null]);
  });

  test("all photos removed produces empty array and null tuple", () => {
    expect(buildPhotoPatch([], [null, null, null], new Map())).toEqual({
      photo_urls:       [],
      third_photo_urls: [null, null, null],
    });
  });

  test("throws when a new file has no uploaded URL", () => {
    const fresh: EditPhoto = { kind: "new", file: fileA };

    expect(() =>
      buildPhotoPatch([fresh], [null, null, null], new Map()),
    ).toThrow(/missing uploaded URL/);
  });
});
