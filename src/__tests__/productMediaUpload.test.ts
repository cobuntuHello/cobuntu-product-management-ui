import { describe, it, expect, afterEach, vi } from "vitest";
import { uploadNewGalleryItems } from "../lib/productMediaUpload";
import { mockFetch } from "./test-utils";
import type { MediaItem } from "../ui/sortable-media-gallery";

/**
 * The orchestration behind ProductMediaModal / EditProductDrawer's new fix:
 * every NEW gallery file is uploaded straight to Cloud Storage (session →
 * resumable PUT → complete) instead of riding along as raw multipart bytes on
 * `/comprehensive`, which Cloud Run's 32 MiB body ceiling silently 413s.
 * docs/features/product-media-direct-upload.md (cobuntu-backend-monorepo)
 */

const authHeaders = () => ({ Authorization: "Bearer t" });
const apiBase = "http://api.test";

function newItem(id: string, name: string): MediaItem {
    const file = new File([new Uint8Array(10)], name, { type: "image/jpeg" });
    return { id, file, preview: `blob:${id}`, type: "image" };
}

function existingItem(id: string, url: string, focal?: { x: number; y: number } | null): MediaItem {
    return { id, preview: url, url, type: "image", isExisting: true, focal: focal ?? null };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("uploadNewGalleryItems", () => {
    it("passes existing items through untouched when there is nothing new", async () => {
        mockFetch([]);
        const items = [existingItem("m1", "https://x/a.jpg")];
        const result = await uploadNewGalleryItems(apiBase, authHeaders, "prod-1", items);
        expect(result).toEqual(items);
    });

    it("turns a new file into an item with a real server id, via session -> resumable PUT -> complete", async () => {
        mockFetch([
            {
                method: "POST", url: /\/media\/upload-session$/,
                body: { uploadUrl: "https://upload.example/session-abc", objectPath: "products/prod-1/media/x.jpg", maxBytes: 200_000_000 },
            },
            { method: "PUT", url: "https://upload.example/session-abc", status: 200 },
            {
                method: "POST", url: /\/media\/upload-complete$/,
                body: { id: "media-server-id" },
            },
        ]);

        const items = [newItem("local-1", "photo.jpg")];
        const result = await uploadNewGalleryItems(apiBase, authHeaders, "prod-1", items);

        expect(result).toEqual([
            expect.objectContaining({ id: "media-server-id", isExisting: true }),
        ]);
    });

    it("keeps existing items in order alongside newly-resolved ones", async () => {
        mockFetch([
            { method: "POST", url: /\/media\/upload-session$/, body: { uploadUrl: "https://upload.example/s", objectPath: "p", maxBytes: 1 } },
            { method: "PUT", url: "https://upload.example/s", status: 200 },
            { method: "POST", url: /\/media\/upload-complete$/, body: { id: "new-id" } },
        ]);

        const items = [existingItem("existing-1", "https://x/a.jpg"), newItem("local-2", "b.jpg")];
        const result = await uploadNewGalleryItems(apiBase, authHeaders, "prod-1", items);

        expect(result.map((m) => m.id)).toEqual(["existing-1", "new-id"]);
        expect(result.every((m) => m.isExisting)).toBe(true);
    });

    it("refuses a file over the 200 MB mirror before any session is requested", async () => {
        const fetchMock = mockFetch([]);
        const file = new File([new Uint8Array(10)], "huge.mp4", { type: "video/mp4" });
        Object.defineProperty(file, "size", { value: 250_000_000 });
        const items: MediaItem[] = [{ id: "local-3", file, preview: "blob:x", type: "video" }];

        await expect(uploadNewGalleryItems(apiBase, authHeaders, "prod-1", items))
            .rejects.toThrow(/huge\.mp4 is 250 MB\. The limit is 200 MB\./);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces the server's own refusal message when the session is denied", async () => {
        mockFetch([
            { method: "POST", url: /\/media\/upload-session$/, status: 403, body: { error: "Not authorized to update this product" } },
        ]);

        const items = [newItem("local-4", "c.jpg")];
        await expect(uploadNewGalleryItems(apiBase, authHeaders, "prod-1", items))
            .rejects.toThrow("Not authorized to update this product");
    });

    it("never calls upload-complete for a file whose transfer failed", async () => {
        const completeCalls: string[] = [];
        mockFetch([
            { method: "POST", url: /\/media\/upload-session$/, body: { uploadUrl: "https://upload.example/dead", objectPath: "p", maxBytes: 1 } },
            // 4xx is refused immediately by uploadResumable, no retry budget spent.
            { method: "PUT", url: "https://upload.example/dead", status: 400 },
            {
                method: "POST", url: /\/media\/upload-complete$/,
                bodyFn: () => { completeCalls.push("called"); return { id: "x" }; },
            },
        ]);

        const items = [newItem("local-5", "d.jpg")];
        await expect(uploadNewGalleryItems(apiBase, authHeaders, "prod-1", items)).rejects.toThrow();
        expect(completeCalls).toEqual([]);
    });
});
