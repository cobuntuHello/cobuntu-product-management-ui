import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { FocalPointModal } from "../ui/focal-point-modal";

/**
 * Choosing what survives the card's crop.
 *
 * REPORTED by a seller: "I crop them to be squares for the course description
 * but it would be good to manually crop what is shown in the Academy because
 * now one of the girls' head is cut off".
 *
 * The crop tool beside this one produces SQUARES, so her stored file really is
 * a square. The cards cover-crop it into a frame of a different shape, taking
 * the trim from the centre outwards — so a square loses its top and bottom,
 * and on a portrait the top is a face.
 */

/*
 * ModalShell portals to document.body, so the render result's `container` is
 * empty and every query has to go through the document. Looking in the
 * container is how these first came back undefined rather than wrong.
 */
const frameOf = () => document.querySelector('[role="application"]') as HTMLElement;
const imgPos = () => (document.querySelector(".fixed img") as HTMLImageElement | null)?.style.objectPosition;

function open(over: Record<string, unknown> = {}) {
  return renderWithConfig(
    <FocalPointModal
      src="https://example.test/cover.jpg"
      value={null}
      onSave={vi.fn()}
      onClose={vi.fn()}
      {...over}
    />,
  );
}

describe("the focus dialog", () => {
  it("previews the CARD's shape, not the file's", () => {
    /*
     * The seller asked to crop "what is shown in the Academy". Showing her the
     * whole square and hoping would be the same guess that caused the report.
     */
    open();
    // Normalised to "<n> / 1" by the DOM, so compare the RATIO rather than
    // the string the browser chose to store it as.
    const [w, h] = frameOf().style.aspectRatio.split("/").map((n) => Number(n.trim()));
    expect(w / (h || 1)).toBeCloseTo(4 / 3, 5);
    expect((document.querySelector(".fixed img") as HTMLImageElement).className).toContain("object-cover");
  });

  it("starts in the middle when nothing has been chosen", () => {
    // Null has to keep meaning "centre": that is what every card did before.
    open({ value: null });
    expect(imgPos()).toBe("50% 50%");
  });

  it("starts from the point already saved", () => {
    open({ value: { x: 30, y: 12 } });
    expect(imgPos()).toBe("30% 12%");
  });

  it("moves the crop to where the seller pressed", () => {
    open();
    const frame = frameOf();
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;

    fireEvent.pointerDown(frame, { clientX: 100, clientY: 60 });

    expect(imgPos()).toBe("25% 20%");
  });

  it("clamps a press that lands outside the frame", () => {
    // Which is exactly where it lands when the subject is at the edge.
    open();
    const frame = frameOf();
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;

    fireEvent.pointerDown(frame, { clientX: -50, clientY: 999 });

    expect(imgPos()).toBe("0% 100%");
  });

  it("survives a frame with no size rather than writing NaN", () => {
    // A dialog measured before layout would otherwise store NaN% and break
    // every card that reads the row.
    open();
    const frame = frameOf();
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;

    fireEvent.pointerDown(frame, { clientX: 10, clientY: 10 });

    expect(imgPos()).toBe("50% 50%");
  });

  it("hands back the chosen point and closes", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    open({ onSave, onClose });
    const frame = frameOf();
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;

    fireEvent.pointerDown(frame, { clientX: 200, clientY: 75 });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ x: 50, y: 25 });
    expect(onClose).toHaveBeenCalled();
  });

  it("offers a way back to the middle", () => {
    open({ value: { x: 90, y: 90 } });
    fireEvent.click(screen.getByRole("button", { name: "Re-centre" }));
    expect(imgPos()).toBe("50% 50%");
  });

  it("does not save when cancelled", () => {
    const onSave = vi.fn();
    open({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("can be nudged from the keyboard", () => {
    // A pointer is not the only way in, and this is the only control here.
    open({ value: { x: 50, y: 50 } });
    const pad = screen.getByRole("group", { name: "Nudge with the arrow keys" });

    fireEvent.keyDown(pad, { key: "ArrowRight" });
    expect(imgPos()).toBe("51% 50%");

    fireEvent.keyDown(pad, { key: "ArrowUp", shiftKey: true });
    expect(imgPos()).toBe("51% 40%");
  });
});
