import { describe, it, expect } from "vitest";
import { T } from "../tokens";

describe("share-image type scale", () => {
  it("body prose clears the legibility floor (>= 2.7% of width)", () => {
    expect(T.type.prose / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.027);
    expect(T.type.body  / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.027);
  });

  it("labels clear the small-text floor (>= 1.6% of width)", () => {
    expect(T.type.eyebrow / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.016);
    expect(T.type.meta    / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.016);
  });

  it("renders a square canvas", () => {
    expect(T.IMAGE_WIDTH).toBe(T.IMAGE_HEIGHT);
  });
});
