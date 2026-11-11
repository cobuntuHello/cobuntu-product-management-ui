import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { SortableMediaGallery, type MediaItem } from "../ui/sortable-media-gallery";
import { COVER_SIZE } from "../lib/coverFormat";

/**
 * The Images modal takes a drop.
 *
 * Asked for by a course seller (2026-11-11) with a screen recording of this
 * modal: she makes covers in another app and has the folder open behind the
 * browser, so dragging the file across beats finding it again in a dialog.
 * Same request events already answered on their banner modal.
 */

// The crop dialog's real cropper needs a canvas the test DOM lacks.
vi.mock("react-easy-crop", () => ({ default: () => <div data-testid="cropper" /> }));

beforeAll(() => {
  // New items get a blob: preview. The value is irrelevant here; only that
  // creating one does not throw in the test DOM. (Assigned, not spied: the
  // setup file restores every spy after each test.)
  if (typeof URL.createObjectURL !== "function") (URL as any).createObjectURL = () => "blob:test";
});

const existing = (n: number): MediaItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`, preview: `https://cdn.example/${i}.png`, url: `https://cdn.example/${i}.png`, type: "image" as const, isExisting: true,
  }));

const png = (name = "cover.png") => new File(["x"], name, { type: "image/png" });
const mp4 = () => new File(["x"], "clip.mp4", { type: "video/mp4" });
const pdf = () => new File(["%PDF"], "deck.pdf", { type: "application/pdf" });

const section = () => screen.getByRole("button", { name: /Drag photos here or click to choose|Drop to add/ });

describe("dropping files into the gallery", () => {
  it("adds dropped images and clips, after what is already there", () => {
    const onChange = vi.fn();
    render(<SortableMediaGallery items={existing(1)} onChange={onChange} maxItems={5} />);

    fireEvent.drop(section(), { dataTransfer: { files: [png(), mp4()] } });

    const next: MediaItem[] = onChange.mock.calls.at(-1)![0];
    expect(next.map((m) => m.type)).toEqual(["image", "image", "video"]);
    expect(next[0].id).toBe("m0"); // the cover stays the cover
    // A File rides along, or the save uploads nothing (the 2026-08-09 outage).
    expect(next[1].file?.name).toBe("cover.png");
  });

  it("ignores what is not a photo or a clip", () => {
    const onChange = vi.fn();
    render(<SortableMediaGallery items={existing(1)} onChange={onChange} maxItems={5} />);

    fireEvent.drop(section(), { dataTransfer: { files: [pdf()] } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops at the cap, the same as the picker does", () => {
    const onChange = vi.fn();
    render(<SortableMediaGallery items={existing(4)} onChange={onChange} maxItems={5} />);

    fireEvent.drop(section(), { dataTransfer: { files: [png("a.png"), png("b.png")] } });

    expect(onChange.mock.calls.at(-1)![0]).toHaveLength(5);
  });

  it("takes a drop over the tiles too, not only over the section", () => {
    const onChange = vi.fn();
    const { container } = render(<SortableMediaGallery items={existing(2)} onChange={onChange} maxItems={5} />);

    fireEvent.drop(container.querySelector("img")!, { dataTransfer: { files: [png()] } });

    expect(onChange.mock.calls.at(-1)![0]).toHaveLength(3);
  });

  it("does not also add a file dropped on the crop dialog it opened", async () => {
    // The crop dialog renders inside this component, and React events bubble
    // through portals: without a stop, one drop replaced the photo being
    // cropped AND appended it to the gallery.
    const onChange = vi.fn();
    const { container } = render(<SortableMediaGallery items={existing(2)} onChange={onChange} maxItems={5} />);

    fireEvent.click(container.querySelector('[title^="Click to crop"]')!);
    const upload = await screen.findByRole("button", { name: /Upload new image/ });
    fireEvent.drop(upload, { dataTransfer: { files: [png()] } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("prevents default on dragover, or the browser opens the file and the edits go", () => {
    render(<SortableMediaGallery items={existing(1)} onChange={vi.fn()} maxItems={5} />);
    const evt = new Event("dragover", { bubbles: true, cancelable: true });
    section().dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("says so while a file is over it", () => {
    render(<SortableMediaGallery items={existing(1)} onChange={vi.fn()} maxItems={5} />);
    fireEvent.dragOver(section());
    expect(screen.getByText("Drop to add")).toBeInTheDocument();
  });
});

describe("the drop section", () => {
  it("is the whole gallery when there is nothing in it yet", () => {
    render(<SortableMediaGallery items={[]} onChange={vi.fn()} maxItems={5} />);
    expect(section()).toBeInTheDocument();
  });

  it("states the size to design a cover at", () => {
    render(<SortableMediaGallery items={[]} onChange={vi.fn()} maxItems={5} />);
    expect(section().textContent).toContain(`${COVER_SIZE.width} × ${COVER_SIZE.height} px`);
  });

  it("goes away at the cap, and the gallery says why", () => {
    render(<SortableMediaGallery items={existing(5)} onChange={vi.fn()} maxItems={5} />);
    expect(screen.queryByRole("button", { name: /Drag photos here/ })).toBeNull();
    expect(screen.getByText(/remove one to add another/)).toBeInTheDocument();
  });

  it("refuses a drop at the cap without letting the browser open the file", () => {
    const onChange = vi.fn();
    const { container } = render(<SortableMediaGallery items={existing(5)} onChange={onChange} maxItems={5} />);
    const img = container.querySelector("img")!;

    const evt = new Event("dragover", { bubbles: true, cancelable: true });
    img.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(screen.queryByText("Drop to add")).toBeNull();

    fireEvent.drop(img, { dataTransfer: { files: [png()] } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
