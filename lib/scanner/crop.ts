/**
 * Maps the on-screen viewfinder frame to source-video pixel coordinates
 * for an object-fit: cover video that fills the whole screen.
 *
 * The scanner previously sent the entire (downscaled) camera frame to OCR;
 * cropping to the frame region keeps the band at native camera resolution.
 */

export interface CoverCropInput {
  videoWidth: number;
  videoHeight: number;
  screenWidth: number;
  screenHeight: number;
  /** Viewfinder square edge length, CSS px */
  frameSize: number;
  /** Vertical offset of the frame center from screen center, as a fraction of frameSize (negative = up) */
  frameOffsetYFrac: number;
  /** Padding multiplier around the frame (1.2 = 20% slop for loose framing) */
  pad: number;
}

export interface CropRect {
  sx: number;
  sy: number;
  size: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeCoverCrop(input: CoverCropInput): CropRect {
  const {
    videoWidth,
    videoHeight,
    screenWidth,
    screenHeight,
    frameSize,
    frameOffsetYFrac,
    pad,
  } = input;

  // object-fit: cover — video is scaled up until it covers the screen,
  // overflow is centered and hidden.
  const scale = Math.max(screenWidth / videoWidth, screenHeight / videoHeight);
  const offsetX = (videoWidth * scale - screenWidth) / 2;
  const offsetY = (videoHeight * scale - screenHeight) / 2;

  const centerX = (screenWidth / 2 + offsetX) / scale;
  const centerY =
    (screenHeight / 2 + frameOffsetYFrac * frameSize + offsetY) / scale;

  const size = Math.min((frameSize * pad) / scale, videoWidth, videoHeight);
  const sx = clamp(centerX - size / 2, 0, videoWidth - size);
  const sy = clamp(centerY - size / 2, 0, videoHeight - size);

  return { sx, sy, size };
}
