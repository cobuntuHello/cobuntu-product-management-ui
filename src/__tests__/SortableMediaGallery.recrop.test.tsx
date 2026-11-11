import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { SortableMediaGallery, type MediaItem } from "../ui/sortable-media-gallery";
import { BannerCropModal } from "../ui/banner-crop-modal";
import { replaceWithCrop } from "../lib/replaceWithCrop";

/**
 * Re-framing a photo that is already there.
 *
 * Found while shipping 4:3 covers (2026-11-11), three defects in one modal:
 *   1. A tile said "Click to crop" and opened a popup whose only real option
 *      was uploading a DIFFERENT photo. A saved cover could not be refitted
 *      to 4:3 without finding the original file again.
 *   2. That popup's "Remove image" closed it and removed nothing.
 *   3. Had cropping a saved photo worked, Save would have kept the old one:
 *      saved photos are never re-uploaded, so the crop has to become a new
 *      photo in the same slot.
 */

// The cropper reports what it was handed and settles a crop area at once,
// the way the real one does when it mounts.
vi.mock("react-easy-crop", () => ({
  default: (props: any) => {
    React.useEffect(() => { props.onCropComplete?.({}, { x: 0, y: 0, width: 40, height: 30 }); }, []);
    return <div data-testid="cropper" data-image={props.image} />;
  },
}));

const saved = (id: string, url: string): MediaItem => ({ id, url, preview: url, type: "image", isExisting: true, focal: { x: 50, y: 20 } });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("clicking a photo", () => {
  it("opens the cropper on THAT photo, not on an upload prompt", async () => {
    render(<SortableMediaGallery items={[saved("a", "https://cdn.example/a.png"), saved("b", "https://cdn.example/b.png")]} onChange={vi.fn()} maxItems={5} />);

    fireEvent.click(document.querySelectorAll('[title^="Click to crop"]')[1]);

    const cropper = await screen.findByTestId("cropper");
    expect(cropper.getAttribute("data-image")).toBe("https://cdn.example/b.png");
    expect(screen.queryByRole("button", { name: /Upload new image/ })).toBeNull();
  });

  it("Remove in the cropper removes the photo", async () => {
    const onChange = vi.fn();
    render(<SortableMediaGallery items={[saved("a", "https://cdn.example/a.png"), saved("b", "https://cdn.example/b.png")]} onChange={onChange} maxItems={5} />);

    fireEvent.click(document.querySelectorAll('[title^="Click to crop"]')[0]);
    // Scoped to the dialog: each tile also has an X titled "Remove".
    await screen.findByTestId("cropper");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Remove$/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)![0].map((m: MediaItem) => m.id)).toEqual(["b"]);
  });
});

describe("what a crop turns a photo into", () => {
  it("a SAVED photo becomes a new, unsaved photo, so Save uploads the crop", () => {
    const next = replaceWithCrop(saved("a", "https://cdn.example/a.png"), PNG);
    expect(next.id).not.toBe("a"); // the old id drops out and is deleted on save
    expect(next.isExisting).toBeFalsy();
    expect(next.file).toBeInstanceOf(File);
    expect(next.preview).toBe(PNG);
    expect(next.focal).toBeNull(); // a point on the old framing means nothing now
  });

  it("an unsaved photo keeps its id and just takes the new file", () => {
    const fresh: MediaItem = { id: "n1", preview: "blob:x", type: "image", file: new File(["x"], "x.png") };
    const next = replaceWithCrop(fresh, PNG);
    expect(next.id).toBe("n1");
    expect(next.file).not.toBe(fresh.file);
    expect(next.preview).toBe(PNG);
  });
});

describe("cropping a saved photo", () => {
  it("fetches it fresh (no-store), so a cached non-CORS copy cannot taint the canvas", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    global.fetch = fetchMock as any;
    render(<BannerCropModal open onOpenChange={() => {}} onSave={() => {}} directCropSrc="https://cdn.example/a.png" hideStockPhotos />);

    await screen.findByTestId("cropper");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("https://cdn.example/a.png");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ mode: "cors", cache: "no-store" });
  });

  it("says so when the save fails, instead of looking like Save did nothing", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as any;
    render(<BannerCropModal open onOpenChange={() => {}} onSave={() => {}} directCropSrc="https://cdn.example/a.png" hideStockPhotos />);

    await screen.findByTestId("cropper");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved/);
  });
});
