import { describe, it, expect } from "vitest";
import { dataUrlToFile } from "../lib/dataUrlToFile";

/**
 * Rebuilding an uploadable File from the cropper's output.
 *
 * The photo flow throws the original File away — the device picker's File is
 * read through a FileReader only to give the cropper a src, and the cropper
 * returns base64 and nothing else. Consumers upload `item.file` and skip
 * items without one, so before this existed every photo added on the create
 * form rendered in the carousel and then vanished at submit: products saved
 * with no images. Reported 2026-08-09.
 */

// 1x1 transparent PNG.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("dataUrlToFile", () => {
  it("returns a File with real bytes for a base64 data URL", () => {
    const f = dataUrlToFile(PNG_1x1, "photo-1");

    expect(f).toBeInstanceOf(File);
    expect(f!.size).toBeGreaterThan(0);
  });

  it("keeps the mime type and gives the file a matching extension", () => {
    // The backend sniffs on both; a .jpg carrying PNG bytes is asking for an
    // opaque upload rejection.
    const png = dataUrlToFile(PNG_1x1, "shot");
    expect(png!.type).toBe("image/png");
    expect(png!.name).toBe("shot.png");

    const jpeg = dataUrlToFile("data:image/jpeg;base64," + PNG_1x1.split(",")[1], "shot");
    expect(jpeg!.type).toBe("image/jpeg");
    expect(jpeg!.name).toBe("shot.jpg");

    const webp = dataUrlToFile("data:image/webp;base64," + PNG_1x1.split(",")[1], "shot");
    expect(webp!.name).toBe("shot.webp");
  });

  it("returns undefined for an already-hosted URL", () => {
    // An https:// image is already stored; re-uploading it would duplicate the
    // object and orphan the original.
    expect(dataUrlToFile("https://cdn.example.test/photo.jpg")).toBeUndefined();
    expect(dataUrlToFile("")).toBeUndefined();
  });

  it("returns undefined rather than a corrupt File for a malformed payload", () => {
    // Dropping the photo beats uploading garbage the backend rejects with an
    // error the seller cannot act on.
    expect(dataUrlToFile("data:image/png;base64,!!!not-base64!!!")).toBeUndefined();
    expect(dataUrlToFile("data:image/png;base64,")).toBeUndefined();
  });

  it("defaults to jpeg when the data URL declares no mime type", () => {
    const f = dataUrlToFile("data:;base64," + PNG_1x1.split(",")[1], "x");
    expect(f!.type).toBe("image/jpeg");
    expect(f!.name).toBe("x.jpg");
  });
});
