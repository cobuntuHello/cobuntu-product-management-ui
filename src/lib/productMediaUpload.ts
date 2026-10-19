import { uploadResumable, oversizeFor } from "./resumable-upload";
import type { MediaItem } from "../ui/sortable-media-gallery";

/**
 * Direct-to-bucket upload for a product's gallery media (photos, short
 * clips). Shared by ProductMediaModal and EditProductDrawer — both attached
 * new gallery files as raw multipart bytes on `PUT .../comprehensive`, which
 * is exactly the request Cloud Run's 32 MiB platform-level body ceiling
 * silently 413s (see lib/resumable-upload.ts's own header comment).
 *
 * docs/features/product-media-direct-upload.md (cobuntu-backend-monorepo)
 */

type UploadSession = { uploadUrl: string; objectPath: string; maxBytes: number };

async function createMediaUploadSession(
    apiBaseUrl: string,
    authHeaders: () => Record<string, string>,
    productId: string,
    file: { originalName: string; contentType: string; sizeBytes: number },
): Promise<UploadSession> {
    const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}/media/upload-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        /*
         * ── The origin travels in the body, and it is load-bearing ───────
         * Cloud Storage stamps a resumable session with one origin, and the
         * response that COMPLETES the upload only carries
         * Access-Control-Allow-Origin when it matches the browser exactly —
         * the intermediate 308s are more forgiving, so getting this wrong
         * fails only on the final chunk. It cannot ride as a header: this is
         * a relative call through a proxy that does not reliably forward
         * Origin, so the server reads it from here instead. Same fix, same
         * reasoning as the course-authoring app's identical call.
         */
        body: JSON.stringify({
            ...file,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Could not start the upload for ${file.originalName}`);
    }
    return res.json();
}

async function completeMediaUpload(
    apiBaseUrl: string,
    authHeaders: () => Record<string, string>,
    productId: string,
    body: { objectPath: string; originalName: string },
): Promise<{ id: string }> {
    const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}/media/upload-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Could not finish the upload for ${body.originalName}`);
    }
    return res.json();
}

/**
 * Upload every NEW (not yet saved) item straight to Cloud Storage and return
 * `items` with those entries carrying a real server id and `isExisting: true`
 * — ready to fold into `mediaReordered` for the `/comprehensive` save that
 * follows. Items that are already existing, or have no file, pass through
 * unchanged.
 *
 * ── Two phases, deliberately not interleaved per file ──────────────────────
 *
 * 1. every new file's BYTES go to the bucket — the slow, failure-prone part
 *    on a real connection, the thing this path exists to survive.
 * 2. only once every transfer has succeeded does any file become a
 *    `product_media` ROW (upload-complete's job).
 *
 * A `product_media` row is immediately live on the storefront — unlike a
 * course lesson, which stays invisible until its section renders it — so
 * creating rows one at a time as each transfer finishes would let an early
 * success go live on the public product page while a later file in the SAME
 * save is still uploading or has failed, before the seller ever presses Save
 * successfully. Finishing every transfer first, then creating every row
 * together, keeps that window to a handful of fast metadata round trips
 * instead of several multi-MB transfers — smaller, not zero, since there is
 * no new backend endpoint here to make the whole batch atomic.
 */
export async function uploadNewGalleryItems(
    apiBaseUrl: string,
    authHeaders: () => Record<string, string>,
    productId: string,
    items: MediaItem[],
): Promise<MediaItem[]> {
    const pending = items.filter((item) => !item.isExisting && item.file);
    if (pending.length === 0) return items;

    // Refused before a byte moves, same message shape the server uses so a
    // seller sees the same wording whichever side caught it.
    for (const item of pending) {
        const tooBig = oversizeFor(item.file!);
        if (tooBig) throw new Error(`${item.file!.name} is ${tooBig.size}. The limit is ${tooBig.limit}.`);
    }

    const transferred = await Promise.all(
        pending.map(async (item) => {
            const session = await createMediaUploadSession(apiBaseUrl, authHeaders, productId, {
                originalName: item.file!.name,
                contentType: item.file!.type || "application/octet-stream",
                sizeBytes: item.file!.size,
            });
            await uploadResumable(session.uploadUrl, item.file!);
            return { item, session };
        }),
    );

    const completed = await Promise.all(
        transferred.map(async ({ item, session }) => {
            const media = await completeMediaUpload(apiBaseUrl, authHeaders, productId, {
                objectPath: session.objectPath,
                originalName: item.file!.name,
            });
            return { itemId: item.id, mediaId: media.id };
        }),
    );

    const resolvedId = new Map(completed.map(({ itemId, mediaId }) => [itemId, mediaId]));
    return items.map((item) =>
        resolvedId.has(item.id) ? { ...item, id: resolvedId.get(item.id)!, isExisting: true } : item,
    );
}
