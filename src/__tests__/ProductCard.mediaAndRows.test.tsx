import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { ProductCard } from "../page/sections/ProductCard";

/**
 * The product card's two columns.
 *
 * LEFT is media. A product is not an event: it has a banner AND a gallery, at
 * whatever aspect ratios the seller shot them in. The old column showed one
 * square image whose only affordance opened the entire edit drawer, so the
 * other images were invisible here and unmanageable from here.
 *
 * RIGHT is one row per editable property, each opening the one editor for that
 * one thing. The "Digital Product" row is gone: it was never editable, so it
 * was a row that looked like the others and did nothing.
 */

const handlers = () => ({
  onEditName: vi.fn(),
  onEditPrice: vi.fn(),
  onEditMedia: vi.fn(),
  onEditCta: vi.fn(),
  onEditDescription: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
});

const product = {
  id: "p1",
  name: "Community Builder Pack",
  price: 1999,
  currency: "USD",
  description: "<p>Most communities don't die because of a lack of vision.</p>",
  media: [
    { id: "m1", url: "https://example.com/1.jpg", order: 0 },
    { id: "m2", url: "https://example.com/2.jpg", order: 1 },
    { id: "m3", url: "https://example.com/3.jpg", order: 2 },
  ],
};

function renderCard(over: Record<string, any> = {}, h = handlers()) {
  const utils = renderWithConfig(
    <ProductCard
      product={{ ...product, ...over }}
      communityTag="avepark"
      isPublished={false}
      listingId={null}
      {...h}
    />,
  );
  return { ...utils, h };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch([{ method: "GET", url: /.*/, body: {} }]);
});

describe("the media column", () => {
  it("leads with the first image and shows the rest as a strip", () => {
    const { container } = renderCard();
    const imgs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(imgs[0]).toBe("https://example.com/1.jpg");
    expect(imgs).toContain("https://example.com/2.jpg");
    expect(imgs).toContain("https://example.com/3.jpg");
  });

  it("sends the banner AND every thumbnail to the same media manager", async () => {
    // One concept, one destination — matching the rows on the right.
    const { h } = renderCard();
    const buttons = screen.getAllByLabelText(/Manage images|Add images/);
    expect(buttons.length).toBeGreaterThan(1);
    await userEvent.click(buttons[0]);
    await userEvent.click(buttons[buttons.length - 1]);
    expect(h.onEditMedia).toHaveBeenCalledTimes(2);
  });

  it("offers a way in when there are no images at all", async () => {
    // The old empty state was a decorative box with no affordance, so a
    // product with no images could not get one from here.
    const { h } = renderCard({ media: [] });
    await userEvent.click(screen.getAllByLabelText(/Manage images|Add images/)[0]);
    expect(h.onEditMedia).toHaveBeenCalled();
  });

  it("draws NO rail at zero images", () => {
    /*
     * REVERSED DELIBERATELY (direction A). This used to assert four dashed
     * slots always render, to keep the column's height constant.
     *
     * Constant height was not worth what it cost: most products have exactly
     * one image, so the common case was a photo above four empty outlines, and
     * a column that is finished read as unfinished. At ZERO images it was
     * worse — an add tile sitting beside a frame that is itself the add
     * control, i.e. the same offer made twice.
     *
     * The frame carries the empty state now, and the rail says nothing when
     * there is nothing to say.
     */
    const { container } = renderCard({ media: [] });
    expect(container.querySelector(".grid-cols-4")).toBeNull();
    expect(screen.getByText("Add your first image")).toBeInTheDocument();
    // A REASON, not a restatement of what the button does.
    expect(screen.getByText(/opened far more often/)).toBeInTheDocument();
  });

  it("gives one rail tile per image after the banner, plus one add tile", () => {
    // The old strip was fixed at four, and its "+" only appeared at one image
    // or fewer — so a three-image product showed two dead tiles you could not
    // add through.
    const { container } = renderCard();  // 3 images
    const rail = container.querySelector(".overflow-x-auto");
    expect(rail).toBeTruthy();
    // 2 thumbnails (images 2 and 3) + the add tile.
    expect(rail?.querySelectorAll("button").length).toBe(3);
    expect(rail?.querySelector('[aria-label="Add images"]')).toBeTruthy();
  });

  it("states how many images there are", () => {
    // Nine and three were indistinguishable: the extras appeared nowhere.
    renderCard();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("the edit rows", () => {
  it("drops the un-editable product-type row", () => {
    // It looked like every other row and did nothing when clicked.
    renderCard();
    expect(screen.queryByText("Digital Product")).not.toBeInTheDocument();
  });

  it("shows a plain-text preview of the description, not its markup", () => {
    renderCard();
    expect(screen.getByText(/Most communities don't die/)).toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  });

  it("renders the description row even when EMPTY", async () => {
    // A row that only appears once the field has a value cannot be the thing
    // you use to give it one.
    const { h } = renderCard({ description: "" });
    await userEvent.click(screen.getByText("Add a description"));
    expect(h.onEditDescription).toHaveBeenCalled();
  });

  it("renders the button-text row even when empty", async () => {
    const { h } = renderCard({ ctaText: "" });
    await userEvent.click(screen.getByText(/Buy now \(default\)/));
    expect(h.onEditCta).toHaveBeenCalled();
  });

  it("opens one editor per property", async () => {
    const { h } = renderCard();
    await userEvent.click(screen.getByText("Community Builder Pack"));
    expect(h.onEditName).toHaveBeenCalled();
    await userEvent.click(screen.getByText(/19\.99/));
    expect(h.onEditPrice).toHaveBeenCalled();
  });

  it("has no buttons on the card", () => {
    // Publish and Edit were competing routes to things the rows already do.
    renderCard();
    expect(screen.queryByText(/^Edit Product$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Publish Product/)).not.toBeInTheDocument();
  });
});

/**
 * The card must not size itself from its own height.
 *
 * The media column used to derive its size from the RIGHT column's measured
 * height via a ResizeObserver — stable only while the left column was exactly
 * one square. Adding the thumbnail strip made left = image + strip, so the row
 * took the taller left side, the right column stretched to match, the observer
 * read the taller right column, and the image grew again. The card inflated
 * until it filled the viewport.
 */
describe("the card has no self-referential sizing", () => {
  it("does not observe its own layout", () => {
    const src = readFileSync(resolve(__dirname, "../page/sections/ProductCard.tsx"), "utf8");
    expect(src).not.toContain("ResizeObserver");
    expect(src).not.toContain("imgSize");
  });

  it("gives the media column a fixed width", () => {
    const { container } = renderCard();
    expect(container.querySelector(".w-\\[200px\\]")).toBeTruthy();
  });

  it("frames the banner at the BUYER's 4/3, not a square", () => {
    /*
     * REVERSED DELIBERATELY (direction A). A buyer meets this product at 4/3
     * twice — the /marketplace grid card and the detail carousel — and this
     * column was the only surface showing a square. A seller framed a photo
     * that looked right here and the storefront trimmed the top and bottom off
     * it, so the crop being approved was one nobody ever saw.
     *
     * The no-measured-height half of the original assertion is KEPT: that is
     * what stops the ResizeObserver feedback loop that once inflated the card
     * until it filled the viewport.
     */
    const { container } = renderCard();
    const banner = container.querySelector(".aspect-\\[4\\/3\\].w-full");
    expect(banner).toBeTruthy();
    expect((banner as HTMLElement).style.height).toBe("");
    expect(container.querySelector(".aspect-square.w-full")).toBeNull();
  });

  it("does not let the rows stretch the row box", () => {
    // `items-start` is what stops the right column growing to the left one's
    // height — the other half of the loop.
    const { container } = renderCard();
    expect(container.querySelector(".items-start")).toBeTruthy();
  });
});

describe("the media column's actions", () => {
  it("takes copy-link OFF the photo", () => {
    /*
     * It was a permanent black band across the bottom of the image, covering
     * the part of the shot most likely to hold the product, for an action that
     * has nothing to do with the picture. It is a row now — which is where
     * every other action on this card already lives.
     */
    const { container } = renderCard();
    const frame = container.querySelector(".aspect-\\[4\\/3\\].w-full") as HTMLElement;
    expect(frame.textContent).not.toContain("Copy product link");
    expect(screen.getByText("Copy product link")).toBeInTheDocument();
  });

  it("still copies the link, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    renderCard();
    await userEvent.click(screen.getByText("Copy product link"));

    expect(writeText).toHaveBeenCalledWith("https://avepark.cobuntu.com/marketplace/p1");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("LABELS the manage action instead of showing a bare pencil", () => {
    // Every other control on this card says what it does; this one made the
    // reader guess from an icon.
    renderCard();
    expect(screen.getByText("Manage images")).toBeInTheDocument();
  });

  it("routes every media surface to the one media manager", async () => {
    // Frame, rail thumbnail, add tile and the labelled pill are four ways to
    // reach ONE destination — that is the point, so pin it.
    const h = handlers();
    const { container } = renderCard(undefined, h);

    await userEvent.click(container.querySelector('[aria-label="Manage images"]') as HTMLElement);
    expect(h.onEditMedia).toHaveBeenCalled();

    h.onEditMedia.mockClear();
    await userEvent.click(container.querySelector('[aria-label="Add images"]') as HTMLElement);
    expect(h.onEditMedia).toHaveBeenCalled();
  });

  it("offers no manage pill when there is no image to manage", () => {
    // At zero the frame is the add control; a "Manage images" pill over an
    // empty state would be an action with no object.
    renderCard({ media: [] });
    expect(screen.queryByText("Manage images")).not.toBeInTheDocument();
  });
});
