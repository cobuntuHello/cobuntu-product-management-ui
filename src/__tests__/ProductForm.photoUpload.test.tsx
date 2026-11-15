import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { ProductForm } from "../components/ProductForm";
import { renderWithConfig } from "./test-utils";

/**
 * A photo added on the create form must reach the consumer as an UPLOADABLE
 * file, not just as something that renders.
 *
 * This is the shape of the 2026-08-09 outage: sellers picked a photo, saw it
 * in the carousel, submitted, and the product came out with no images. The
 * consumer uploads `item.file` and skips items without one, so an item with
 * only a preview rendered perfectly and saved nothing.
 *
 * The photos are the shared MediaManager now (upload modal, framing each
 * photo, reorder, re-frame, replace, remove), tested in
 * @cobuntu/management-ui-shared. What this form owns is `commit`: what a
 * framed photo becomes. The manager is stubbed to hand it one framed photo,
 * and the assertion is on `file`.
 */

const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

vi.mock("@cobuntu/management-ui-shared", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    MediaManager: ({ items, onChange, commit, aspect, maxItems }: any) => (
      <div data-testid="media" data-aspect={aspect} data-max={maxItems}>
        <button type="button" onClick={async () => {
          const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
          const item = await commit({ dataUrl: PNG_1x1, file, width: 1600, height: 1200, source: PNG_1x1, confirmed: false });
          onChange([...items, item]);
        }}>frame one</button>
        <button type="button" onClick={async () => {
          const file = new File(["y"], "photo.jpg", { type: "image/jpeg" });
          const item = await commit({ dataUrl: PNG_1x1, file, width: 1600, height: 1200, source: PNG_1x1, confirmed: false }, items[0]);
          onChange([item, ...items.slice(1)]);
        }}>reframe first</button>
      </div>
    ),
  };
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  communityTag: "orbis",
  initialData: {
    name: "Cool product", description: "", tags: [], mediaItems: [], productFiles: [],
    isPaid: false, price: "", currency: "USD", isRecurring: false,
    recurringInterval: "monthly" as const, ctaText: "",
  },
  onChange: vi.fn(),
  ...overrides,
});

describe("ProductForm — photos survive as uploadable files", () => {
  it("uses the shared photo manager at the cover's 4:3, up to 5", () => {
    renderWithConfig(<ProductForm {...baseProps()} />);
    const media = screen.getByTestId("media");
    expect(Number(media.getAttribute("data-aspect"))).toBeCloseTo(4 / 3);
    expect(media.getAttribute("data-max")).toBe("5");
  });

  it("a framed photo reaches the consumer with a File attached, and its preview", async () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "frame one" }));
    await waitFor(() => {
      const media = onChange.mock.calls.at(-1)?.[0]?.mediaItems ?? [];
      expect(media.length).toBe(1);
      // THE assertion. Without a File the consumer uploads nothing.
      expect(media[0].file).toBeInstanceOf(File);
      expect(media[0].file.size).toBeGreaterThan(0);
      expect(media[0].preview).toContain("data:image/png");
    });
  });

  it("re-framing a SAVED photo makes it a new upload in the same slot", async () => {
    const onChange = vi.fn();
    const saved = { id: "saved-1", preview: "https://cdn/x.jpg", url: "https://cdn/x.jpg", type: "image" as const, isExisting: true };
    renderWithConfig(<ProductForm {...baseProps({ onChange, initialData: { ...baseProps().initialData, mediaItems: [saved] } })} />);
    fireEvent.click(screen.getByRole("button", { name: "reframe first" }));
    await waitFor(() => {
      const media = onChange.mock.calls.at(-1)?.[0]?.mediaItems ?? [];
      expect(media[0].id).not.toBe("saved-1");
      expect(media[0].isExisting).toBeFalsy();
      expect(media[0].file).toBeInstanceOf(File);
    });
  });
});
