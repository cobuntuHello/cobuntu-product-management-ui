import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { BannerCropModal } from "../ui/banner-crop-modal";
import { COVER_ASPECT, COVER_SIZE } from "../lib/coverFormat";

/**
 * The product/course cover cropper: one shape, a stated size, and a drop.
 *
 * REPORTED by a course seller (2026-11-11), three things at once:
 *   - "it's very hard to design a course cover in the right dimensions
 *     because there are different ways how it is displayed": this cropper
 *     framed a square while every buyer-facing card showed 4:3.
 *   - "maybe add info on what dimensions are needed".
 *   - a drag-and-drop section in the image modal, as events already have.
 */

// The real cropper draws to a canvas happy-dom has no 2d context for. The
// mock reports what it was handed, which is what these tests are about.
vi.mock("react-easy-crop", () => ({
  default: (props: any) => (
    <div data-testid="cropper" data-image={props.image} data-aspect={String(props.aspect)} />
  ),
}));

const INITIAL = "data:image/png;base64,AAAA";
const png = (name = "cover.png") => new File(["binary"], name, { type: "image/png" });
const pdf = () => new File(["%PDF"], "deck.pdf", { type: "application/pdf" });

/** Straight on the crop step, as the create form opens it. */
const renderCrop = () =>
  render(
    <BannerCropModal open onOpenChange={() => {}} onSave={() => {}} title="Frame your photo" directCropSrc={INITIAL} hideStockPhotos />,
  );

/** The choose step, as a gallery tile opens it. */
const renderOptions = () =>
  render(
    <BannerCropModal open onOpenChange={() => {}} onSave={() => {}} title="Crop Image" initialImageSrc="https://cdn.example/x.png" hideStockPhotos />,
  );

const cropper = () => screen.getByTestId("cropper");
const uploadButton = () => screen.getByRole("button", { name: /Upload new image/ });

describe("the cover is framed in the shape buyers see", () => {
  it("crops at 4:3, not the square no card ever showed", () => {
    renderCrop();
    expect(COVER_ASPECT).toBeCloseTo(4 / 3);
    expect(Number(cropper().getAttribute("data-aspect"))).toBeCloseTo(4 / 3);
  });

  it("draws the frame at 4:3 too, so the window matches the crop", () => {
    renderCrop();
    expect(cropper().closest(".aspect-\\[4\\/3\\]")).toBeTruthy();
  });

  it("says what size to design at, on both steps", () => {
    const size = `${COVER_SIZE.width} × ${COVER_SIZE.height} px`;
    const { unmount } = renderCrop();
    expect(screen.getByText(new RegExp(size))).toBeInTheDocument();
    unmount();

    renderOptions();
    expect(uploadButton().textContent).toContain(size);
  });

  it("recommends a size the upload cap leaves untouched", () => {
    // MAX_IMAGE_EDGE in management-ui-shared is 2000. A cover made at the
    // recommended size must not be resampled on the way up.
    expect(Math.max(COVER_SIZE.width, COVER_SIZE.height)).toBeLessThanOrEqual(2000);
    expect(COVER_SIZE.width / COVER_SIZE.height).toBeCloseTo(COVER_ASPECT);
  });
});

describe("dropping an image", () => {
  it("on the choose step goes straight to the crop, as picking would", async () => {
    renderOptions();
    fireEvent.drop(uploadButton(), { dataTransfer: { files: [png()] } });
    await waitFor(() => expect(cropper()).toBeInTheDocument());
    expect(cropper().getAttribute("data-image")).toMatch(/^data:image\/png/);
  });

  it("on the crop step replaces the image being framed", async () => {
    renderCrop();
    fireEvent.drop(cropper(), { dataTransfer: { files: [png("other.png")] } });
    await waitFor(() => expect(cropper().getAttribute("data-image")).not.toBe(INITIAL));
  });

  it("ignores a file that is not an image", async () => {
    // Reading a PDF would hand the cropper a data URL it cannot draw: a blank
    // frame, no reason given, and the chosen photo gone.
    renderCrop();
    fireEvent.drop(cropper(), { dataTransfer: { files: [pdf()] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(cropper().getAttribute("data-image")).toBe(INITIAL);
  });

  it("prevents default on dragover, or the browser opens the file and the product goes", () => {
    renderCrop();
    const evt = new Event("dragover", { bubbles: true, cancelable: true });
    cropper().dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("acknowledges the drag on the choose step", () => {
    renderOptions();
    fireEvent.dragOver(uploadButton());
    expect(screen.getByRole("button", { name: /Drop to use this image/ })).toBeInTheDocument();
  });
});
