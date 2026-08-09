/**
 * Turn a data URL back into a File that can be uploaded.
 *
 * The photo flow loses the original File before anyone can use it: the device
 * picker hands over a File, `onPhotoFile` reads it through a FileReader purely
 * to feed the cropper a src, and the cropper returns `{ base64 }` and nothing
 * else. By the time a photo reaches the carousel there is no File left —
 * only a data URL sitting in `preview`.
 *
 * That was fine for rendering and fatal for saving. The consumer uploads
 * multipart `media` files and skips any item without `.file`, so every photo
 * added on the create form was silently dropped: the seller saw their photo in
 * the carousel, submitted, and the product came out with no images at all.
 * Reported 2026-08-09 by several sellers ("no images are being uploaded").
 *
 * Returns undefined for anything that is not a data URL — an already-hosted
 * https:// image has nothing to re-upload and must keep its existing url.
 */

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function dataUrlToFile(dataUrl: string, baseName = "photo"): File | undefined {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return undefined;

  const mime = match[1] || "image/jpeg";
  const isBase64 = !!match[2];
  const payload = match[3] ?? "";

  let bytes: Uint8Array;
  try {
    if (isBase64) {
      const binary = atob(payload);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      // Non-base64 data URLs are percent-encoded text. Rare for images, but
      // decoding it is cheaper than special-casing a failure.
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
  } catch {
    // Malformed payload — better to drop the photo than to upload garbage
    // that the backend will reject with an opaque error.
    return undefined;
  }

  if (bytes.length === 0) return undefined;

  const ext = EXT_BY_MIME[mime] || "jpg";
  return new File([bytes as BlobPart], `${baseName}.${ext}`, { type: mime });
}
