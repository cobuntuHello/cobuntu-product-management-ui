import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadResumable, UploadCancelled, humanSize, oversizeFor, MAX_UPLOAD_BYTES } from "../lib/resumable-upload";

/**
 * The client half of direct-to-bucket gallery upload
 * (docs/features/product-media-direct-upload.md, cobuntu-backend-monorepo).
 * Ported from cobuntu-course-management-ui's lib/resumable-upload.ts
 * (T-221) — these tests pin the PUT/Content-Range protocol against the
 * session URL, not against our own API, since the whole point of this file
 * is that the browser talks to Cloud Storage directly.
 */

const CHUNK = 8 * 256 * 1024 * 4; // 8 MiB, matching the module's own constant

function fileOfSize(bytes: number): File {
    return new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });
}

describe("oversizeFor / humanSize", () => {
    it("is a mirror of the server's own 200 MB ceiling", () => {
        expect(MAX_UPLOAD_BYTES).toBe(200_000_000);
    });

    it("passes a file under the limit", () => {
        expect(oversizeFor({ name: "a.jpg", size: 5_000_000 })).toBeNull();
    });

    it("reports both the file's real size and the limit, in decimal units", () => {
        expect(oversizeFor({ name: "clip.mp4", size: 250_000_000 })).toEqual({
            size: "250 MB",
            limit: "200 MB",
        });
    });

    it("formats under a megabyte in KB", () => {
        expect(humanSize(42_000)).toBe("42 KB");
    });
});

describe("uploadResumable", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends one PUT with the whole file when it fits in a single chunk, and reports 100%", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

        const file = fileOfSize(1024);
        const progress: number[] = [];
        await uploadResumable("https://upload.example/session-1", file, {
            onProgress: (p) => progress.push(p.percent),
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://upload.example/session-1");
        expect(init.headers["Content-Range"]).toBe(`bytes 0-1023/1024`);
        expect(progress[0]).toBe(0);
        expect(progress[progress.length - 1]).toBe(100);
    });

    it("sends a second PUT for the next chunk after a 308, with the advanced Content-Range", async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(null, { status: 308 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));

        const total = CHUNK + 1000;
        const file = fileOfSize(total);
        await uploadResumable("https://upload.example/session-2", file);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].headers["Content-Range"]).toBe(`bytes 0-${CHUNK - 1}/${total}`);
        expect(fetchMock.mock.calls[1][1].headers["Content-Range"]).toBe(`bytes ${CHUNK}-${total - 1}/${total}`);
    });

    /*
     * A dropped connection re-asks the session where it got to rather than
     * blindly resending from the last known offset — resending a range GCS
     * already committed is both wasteful and, at a chunk boundary, wrong.
     */
    it("probes committedBytes after a network failure and resumes from there, not from zero", async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            // The probe: a zero-length PUT with Content-Range "bytes */total".
            .mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: "bytes=0-99" } }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));

        const file = fileOfSize(1000);
        await uploadResumable("https://upload.example/session-3", file);

        const probeCall = fetchMock.mock.calls[1];
        expect(probeCall[1].headers["Content-Range"]).toBe("bytes */1000");
        // Resumed from byte 100 (the probe's Range end + 1), not from 0.
        const resumeCall = fetchMock.mock.calls[2];
        expect(resumeCall[1].headers["Content-Range"]).toBe("bytes 100-999/1000");
    });

    it("gives up with a readable message after repeated drops, naming the percent already uploaded", async () => {
        vi.useFakeTimers();
        try {
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

            const file = fileOfSize(1000);
            // The assertion attaches its rejection handler before the retry
            // budget's backoff delays (up to 500+1000+2000+4000ms) are fast-
            // forwarded in one jump, so nothing here waits on a real clock.
            const expectation = expect(uploadResumable("https://upload.example/session-4", file))
                .rejects.toThrow(/kept dropping with 0% uploaded/);
            await vi.advanceTimersByTimeAsync(20_000);
            await expectation;
        } finally {
            vi.useRealTimers();
        }
    });

    it("throws a non-retryable error immediately on a 4xx, without burning retries", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));

        const file = fileOfSize(1000);
        await expect(uploadResumable("https://upload.example/session-5", file))
            .rejects.toThrow(/refused \(400\)/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws UploadCancelled when the caller aborts mid-upload", async () => {
        const controller = new AbortController();
        fetchMock.mockImplementationOnce(() => {
            controller.abort();
            return Promise.reject(new DOMException("Aborted", "AbortError"));
        });

        const file = fileOfSize(1000);
        await expect(uploadResumable("https://upload.example/session-6", file, { signal: controller.signal }))
            .rejects.toBeInstanceOf(UploadCancelled);
    });
});
