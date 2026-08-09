import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductForm } from "../components/ProductForm";
import { renderWithConfig } from "./test-utils";

vi.mock("react-quill-new", () => ({ default: () => null }));

/**
 * A photo added on the create form must reach the consumer as an UPLOADABLE
 * file, not just as something that renders.
 *
 * This is the shape of the 2026-08-09 outage: sellers picked a photo, saw it
 * in the carousel, submitted, and the product came out with no images. The
 * cropper returns base64 only and the original File is discarded before it —
 * so the media item carried a preview that rendered perfectly and nothing the
 * consumer could upload, since it uploads `item.file` and skips items without
 * one.
 *
 * A test asserting "the photo appears in the carousel" would have passed
 * throughout. The assertion that matters is on `file`.
 */

const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// The cropper is a canvas-heavy modal; stub it to hand back a cropped data URL
// the moment it opens, which is all this test cares about.
vi.mock("../ui/banner-crop-modal", () => ({
  BannerCropModal: ({ open, onSave }: any) => {
    if (open) queueMicrotask(() => onSave({ base64: PNG_1x1 }));
    return null;
  },
}));

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
  it("a cropped photo reaches the consumer with a File attached", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithConfig(<ProductForm {...baseProps({ onChange })} />);

    const input = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    await user.upload(input, new File(["x"], "seller-photo.png", { type: "image/png" }));

    await waitFor(() => {
      const media = onChange.mock.calls.at(-1)?.[0]?.mediaItems ?? [];
      expect(media.length).toBe(1);
      // THE assertion. Without a File the consumer uploads nothing and the
      // product saves with no images, which is exactly what shipped.
      expect(media[0].file).toBeInstanceOf(File);
      expect(media[0].file.size).toBeGreaterThan(0);
    });
  });

  it("still carries the preview so the carousel renders", async () => {
    // The preview was never the broken half — pinned so a fix for `file`
    // cannot quietly cost the rendering.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithConfig(<ProductForm {...baseProps({ onChange })} />);

    const input = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "seller-photo.png", { type: "image/png" }));

    await waitFor(() => {
      const media = onChange.mock.calls.at(-1)?.[0]?.mediaItems ?? [];
      expect(media[0]?.preview).toContain("data:image/png");
    });
  });
});
