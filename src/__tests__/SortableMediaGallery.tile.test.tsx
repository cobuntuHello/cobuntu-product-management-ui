import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SortableMediaGallery, type MediaItem } from "../ui/sortable-media-gallery";

/**
 * A management tile shows the seller what they HAVE.
 *
 * THE BUG THIS EXISTS FOR: the tiles were `object-cover` on a square frame, so
 * a wide slide was trimmed to its middle. On a photo that is harmless; on the
 * slides and diagrams people put in a course it cut the title off the top and
 * the edges off the sides, and the strip became fragments the seller could not
 * tell apart.
 *
 * Worse, it misreported the file. Nothing crops on upload, so the stored image
 * and the product page were fine — only the preview was trimmed. A seller
 * reported her course images as "just cropped" on the strength of this tile.
 */

const items: MediaItem[] = [
    { id: "a", preview: "https://example.test/wide.png", url: "https://example.test/wide.png", type: "image", isExisting: true },
    { id: "b", preview: "https://example.test/tall.png", url: "https://example.test/tall.png", type: "image", isExisting: true },
];

function renderGallery() {
    return render(
        <SortableMediaGallery items={items} onChange={vi.fn()} maxItems={5} />,
    );
}

describe("media tiles", () => {
    it("shows the whole image rather than trimming it to the tile", () => {
        const { container } = renderGallery();
        const images = Array.from(container.querySelectorAll("img"));

        expect(images.length).toBeGreaterThan(0);
        for (const img of images) {
            expect(img.className).toContain("object-contain");
            expect(img.className).not.toContain("object-cover");
        }
    });

    it("keeps one tile shape, the cover's 4:3, so the strip stays a grid", () => {
        // The fix is about what the image does INSIDE the tile, not about
        // letting each tile take its own shape and making the row ragged.
        // The shape is 4:3 (was square) since every cover is shown at 4:3:
        // a cover made at the recommended size fills its tile exactly.
        const { container } = renderGallery();
        expect(container.innerHTML).toContain("aspect-[4/3]");
        expect(container.innerHTML).not.toContain("aspect-square");
    });

    it("still offers cropping, which is now the only thing that crops", () => {
        const { container } = renderGallery();
        expect(container.innerHTML).toContain("Click to crop");
    });

    it("offers no card focal point, since cards no longer trim the cover", () => {
        /*
         * "Choose what the card shows" aimed the card's trim. Cards now show the
         * whole cover over a blurred fill (community app CardCover), so the
         * control would preview a crop that never happens.
         */
        const { container, queryByLabelText } = renderGallery();
        expect(queryByLabelText("Choose what the card shows")).toBeNull();
        expect(container.innerHTML).not.toContain("Choose what the card shows");
    });
});
