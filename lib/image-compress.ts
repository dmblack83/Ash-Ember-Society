/*
 * Client-side image compression for upload paths that hit Vercel's
 * 4.5 MB function payload limit.
 *
 * iPhone camera shots are commonly 4-8 MB. Vercel rejects requests
 * over 4.5 MB with `FUNCTION_PAYLOAD_TOO_LARGE`, which iOS PWAs
 * surface as a TLS error mid-upload (connection terminated before
 * the full body lands). Compressing client-side eliminates the
 * cliff and reduces upload time on cellular.
 */

interface CompressOptions {
  /** Long-edge cap in pixels. Defaults to 1600, which renders crisply
   *  at any reasonable display size and keeps re-encoded JPEGs under
   *  ~500 KB for typical iPhone photos. */
  maxDim?:  number;
  /** JPEG quality 0..1. Defaults to 0.85 (visually lossless for photos). */
  quality?: number;
}

/*
 * Resize and re-encode an image File. Returns the original File unchanged
 * for inputs that can't be decoded through canvas (SVG, non-image types,
 * or browsers where canvas/toBlob are unavailable).
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const maxDim  = opts.maxDim  ?? 1600;
  const quality = opts.quality ?? 0.85;

  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload  = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src     = objectUrl;
    });

    const longEdge = Math.max(img.width, img.height);
    const scale    = longEdge > maxDim ? maxDim / longEdge : 1;
    const w        = Math.round(img.width  * scale);
    const h        = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) return file;

    /* Force .jpg since we re-encoded. Server-side ext allowlist
       (jpg/jpeg/png/webp/gif) accepts this. */
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, {
      type:         "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
