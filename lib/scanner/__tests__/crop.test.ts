import { describe, it, expect } from "vitest";
import { computeCoverCrop } from "../crop";

describe("computeCoverCrop", () => {
  // iPhone-ish portrait: 1080x1920 camera, 390x844 CSS viewport,
  // 300px frame centered, shifted up 10% of frame height, 20% padding.
  const portrait = {
    videoWidth: 1080,
    videoHeight: 1920,
    screenWidth: 390,
    screenHeight: 844,
    frameSize: 300,
    frameOffsetYFrac: -0.1,
    pad: 1.2,
  };

  it("maps the frame center to the horizontal center of the video", () => {
    const crop = computeCoverCrop(portrait);
    // Frame is horizontally centered on screen -> crop centered in video width
    expect(crop.sx + crop.size / 2).toBeCloseTo(540, 0);
  });

  it("scales the frame by the cover factor", () => {
    const crop = computeCoverCrop(portrait);
    // cover scale = max(390/1080, 844/1920) = 0.43958…
    // size = 300 * 1.2 / 0.43958 ≈ 819
    expect(crop.size).toBeCloseTo(818.9, 0);
  });

  it("shifts the crop up by the frame offset", () => {
    const noOffset = computeCoverCrop({ ...portrait, frameOffsetYFrac: 0 });
    const shifted = computeCoverCrop(portrait);
    // -10% of 300px frame = 30 CSS px = 30 / 0.43958 ≈ 68 video px higher
    expect(noOffset.sy - shifted.sy).toBeCloseTo(30 / 0.4395833, 0);
  });

  it("stays within video bounds", () => {
    const crop = computeCoverCrop(portrait);
    expect(crop.sx).toBeGreaterThanOrEqual(0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
    expect(crop.sx + crop.size).toBeLessThanOrEqual(portrait.videoWidth);
    expect(crop.sy + crop.size).toBeLessThanOrEqual(portrait.videoHeight);
  });

  it("clamps oversized crops to the video's short edge", () => {
    const crop = computeCoverCrop({ ...portrait, pad: 10 });
    expect(crop.size).toBe(1080);
    expect(crop.sx).toBe(0);
  });

  it("handles landscape video sources", () => {
    const crop = computeCoverCrop({
      ...portrait,
      videoWidth: 1920,
      videoHeight: 1080,
    });
    // cover scale = max(390/1920, 844/1080) = 0.78148
    expect(crop.size).toBeCloseTo((300 * 1.2) / 0.7814815, 0);
    expect(crop.sx + crop.size / 2).toBeCloseTo(960, 0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
    expect(crop.sy + crop.size).toBeLessThanOrEqual(1080);
  });
});
