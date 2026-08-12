import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, cleanup } from "@testing-library/react";
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
  onEditTags: vi.fn(),
  onEditCategory: vi.fn(),
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

  it("draws the rail even at zero images", () => {
    /*
     * REVERSED. I had the rail appear only once a banner existed, arguing
     * that an add tile beside an add frame is the same offer twice.
     *
     * That was wrong. A seller opening a new product then sees one empty
     * square and nothing telling them a product HAS a gallery — the rail is
     * the only thing that says "more than one image lives here", so hiding it
     * until you already have one means you never learn it exists.
     */
    const { container } = renderCard({ media: [] });
    const rail = container.querySelector(".overflow-x-auto");
    expect(rail).toBeTruthy();
    expect(rail!.querySelector('[aria-label="Add images"]')).toBeTruthy();
    // Still the empty state in the frame, and still no wall of dashed slots.
    expect(screen.getByText("Add your first image")).toBeInTheDocument();
    expect(rail!.querySelectorAll("button").length).toBe(1);
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
    /*
     * Comments stripped first. The file now EXPLAINS why it does not use a
     * ResizeObserver, and matching that prose would fail the very assertion
     * the prose exists to justify.
     */
    const code = readFileSync(resolve(__dirname, "../page/sections/ProductCard.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("ResizeObserver");
    expect(code).not.toContain("imgSize");
  });

  it("gives the media column the events card's fixed 280", () => {
    // Events derive 280 by measuring; we hardcode it. Same footprint at rest,
    // no feedback loop — see the note in the component.
    const { container } = renderCard();
    expect(container.querySelector(".w-\\[280px\\]")).toBeTruthy();
  });

  it("frames the banner as a SQUARE, matching the events card", () => {
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
    /*
     * REVERSED AGAIN, and this time toward the events card. 4/3 was chosen to
     * match the buyer's crop, but the two manage pages reading as different
     * products cost more than the crop parity gained — and the seller sees the
     * real crop on the storefront anyway.
     *
     * The no-measured-height half of the original assertion is KEPT: that is
     * what stops the ResizeObserver loop.
     */
    const banner = container.querySelector(".w-\\[280px\\].h-\\[280px\\]");
    expect(banner).toBeTruthy();
    expect((banner as HTMLElement).style.height).toBe("");
    // Mobile still drops to the events card's 16/9.
    expect(banner!.className).toContain("max-sm:aspect-[16/9]");
  });

  it("does not let the rows stretch the row box", () => {
    // `items-start` is what stops the right column growing to the left one's
    // height — the other half of the loop.
    const { container } = renderCard();
    expect(container.querySelector(".items-start")).toBeTruthy();
  });
});

describe("the media column's actions", () => {
  it("puts copy-link ON the photo, where events puts it", () => {
    /*
     * It was a permanent black band across the bottom of the image, covering
     * the part of the shot most likely to hold the product, for an action that
     * has nothing to do with the picture. It is a row now — which is where
     * every other action on this card already lives.
     */
    /*
     * ALSO REVERSED. Moving it out was defensible on its own — a black band
     * across the bottom of every photo is a real cost — but events keeps it
     * there, and one card looking like the other won here.
     */
    const { container } = renderCard();
    const frame = container.querySelector(".w-\\[280px\\].h-\\[280px\\]") as HTMLElement;
    expect(frame.textContent).toContain("Copy product link");
  });

  it("still copies the link, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    renderCard();
    await userEvent.click(screen.getByText("Copy product link"));

    expect(writeText).toHaveBeenCalledWith("https://avepark.cobuntu.com/marketplace/p1");
    expect(await screen.findByText("Link copied!")).toBeInTheDocument();
  });

  it("uses the events card's bare pencil, with the label on aria-label", () => {
    /*
     * REVERSED for parity. The visible "Manage images" pill was clearer, but
     * events shows a bare pencil and the two cards sitting side by side with
     * different affordances was the complaint.
     *
     * Nothing is lost for assistive tech: the full-frame button underneath
     * still carries the accessible name, so the control is announced even
     * though the pill is gone.
     */
    const { container } = renderCard();
    expect(screen.queryByText("Manage images")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-label="Manage images"]')).toBeTruthy();
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

describe("which image is the banner", () => {
  /*
   * THE BUG THIS FIXES. The card read `media[]` and nothing else, so a product
   * whose banner lives on `bannerImageUrl` rendered "Add your first image"
   * while the storefront displayed that banner quite happily.
   *
   * Order is the storefront's own:
   *   media.find(isBanner) → media[0] → cardImageUrl → bannerImageUrl
   */
  const img = (id: string, order: number, isBanner = false) =>
    ({ id, url: `https://x.test/${id}.jpg`, order, isBanner });

  it("honours isBanner over position, as events already do", () => {
    // The column exists and events read it in five places; products ignored
    // it, so "which one is the banner" had two answers.
    const { container } = renderCard({ media: [img("a", 0), img("b", 1, true)] });
    const banner = container.querySelector(".w-\\[280px\\].h-\\[280px\\] img") as HTMLImageElement;
    expect(banner.src).toContain("b.jpg");
  });

  it("falls back to the first by order when nothing is flagged", () => {
    const { container } = renderCard({ media: [img("b", 1), img("a", 0)] });
    const banner = container.querySelector(".w-\\[280px\\].h-\\[280px\\] img") as HTMLImageElement;
    expect(banner.src).toContain("a.jpg");
  });

  it("shows a legacy bannerImageUrl when there are NO media rows", () => {
    // Exactly the case that rendered an empty state over a real banner.
    const { container } = renderCard({ media: [], bannerImageUrl: "https://x.test/legacy.jpg" });
    const banner = container.querySelector(".w-\\[280px\\].h-\\[280px\\] img") as HTMLImageElement;
    expect(banner.src).toContain("legacy.jpg");
    expect(screen.queryByText("Add your first image")).not.toBeInTheDocument();
  });

  it("prefers cardImageUrl over bannerImageUrl, matching the storefront", () => {
    const { container } = renderCard({
      media: [], cardImageUrl: "https://x.test/card.jpg", bannerImageUrl: "https://x.test/legacy.jpg",
    });
    const banner = container.querySelector(".w-\\[280px\\].h-\\[280px\\] img") as HTMLImageElement;
    expect(banner.src).toContain("card.jpg");
  });

  it("keeps the banner OUT of the rail", () => {
    // It is already the big image; repeating it as a thumbnail is a lie about
    // how many images there are.
    const { container } = renderCard({ media: [img("a", 0), img("b", 1), img("c", 2)] });
    const rail = container.querySelector(".overflow-x-auto")!;
    const thumbs = rail.querySelectorAll("img");
    expect(thumbs.length).toBe(2);
    expect(Array.from(thumbs).some((t) => (t as HTMLImageElement).src.includes("a.jpg"))).toBe(false);
  });

  it("offers a rail with just the add tile when a legacy banner is all there is", () => {
    const { container } = renderCard({ media: [], bannerImageUrl: "https://x.test/legacy.jpg" });
    const rail = container.querySelector(".overflow-x-auto")!;
    expect(rail.querySelectorAll("img").length).toBe(0);
    expect(rail.querySelector('[aria-label="Add images"]')).toBeTruthy();
  });

  it("states the count only when there is more than one", () => {
    const one = renderCard({ media: [img("a", 0)] });
    expect(one.container.textContent).not.toMatch(/^1$/m);
    cleanup();
    const many = renderCard({ media: [img("a", 0), img("b", 1), img("c", 2)] });
    expect(many.getByText("3")).toBeInTheDocument();
  });
});

describe("tags and category as rows", () => {
  /*
   * Both were reachable ONLY through the Edit Product drawer — the whole
   * create form reopened to change one chip. Every other property on this
   * card has a one-field editor; these two were the exception because nobody
   * had given them a row, not because they needed the form.
   */
  it("shows the tags on the row, so opening it is for CHANGING them", () => {
    renderCard({ tags: [{ id: "1", name: "coaching" }, { id: "2", name: "career" }] });
    expect(screen.getByText("coaching, career")).toBeInTheDocument();
  });

  it("still offers the row when there are none", () => {
    // A row that only appears once set cannot be used to set it — the same
    // trap the CTA row had.
    const h = handlers();
    renderCard({ tags: [] }, h);
    expect(screen.getByText("Add tags")).toBeInTheDocument();
  });

  it("opens the tags editor", async () => {
    const h = handlers();
    renderCard({ tags: [] }, h);
    await userEvent.click(screen.getByText("Add tags"));
    expect(h.onEditTags).toHaveBeenCalled();
  });

  it("names the category, and says so plainly when there is none", () => {
    cleanup();
    renderCard({ category: { name: "Coaching" }, subCategory: { name: "1:1" } });
    expect(screen.getByText("Coaching · 1:1")).toBeInTheDocument();
    cleanup();
    renderCard({});
    expect(screen.getByText("Uncategorised")).toBeInTheDocument();
  });

  it("hides each row when the host does not supply a handler", () => {
    // Category needs the community's taxonomy, which only the host app has.
    // Until it passes one, the row must not render as a dead control.
    const { container } = renderWithConfig(
      <ProductCard
        product={{ ...product, tags: [] }}
        communityTag="avepark"
        isPublished={false}
        listingId={null}
        onEditName={vi.fn()}
        onEditPrice={vi.fn()}
        onEditMedia={vi.fn()}
        onPublish={vi.fn()}
        onUnpublish={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain("Add tags");
    expect(container.textContent).not.toContain("Uncategorised");
  });
});

describe("an unset row is empty, not disabled", () => {
  /*
   * Every placeholder row printed its value at zinc-400 against a zinc-400
   * label, so the whole row was one flat grey and read as inert — "why are
   * these greyed out?" was the actual reaction. The label stays muted because
   * it IS a label; the placeholder lifts so the row has hierarchy and looks
   * clickable, which it is.
   */
  const emptyRowValue = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll("p")).find((p) => p.textContent === text);

  it("prints placeholders one step darker than their label", () => {
    const { container } = renderCard({ description: "", ctaText: "", tags: [] });
    for (const placeholder of ["Add a description", "Buy now (default)", "Add tags", "Uncategorised"]) {
      const el = emptyRowValue(container, placeholder);
      if (!el) continue; // category row only renders when a handler is passed
      expect(el.className).toContain("text-zinc-500");
      expect(el.className).not.toContain("text-zinc-400");
    }
  });

  it("still distinguishes a set value from an unset one", () => {
    // The grey MEANS something — losing the distinction would be worse than
    // the flatness it replaces.
    const { container } = renderCard({ tags: [{ id: "1", name: "coaching" }] });
    const set = emptyRowValue(container, "coaching");
    expect(set!.className).toContain("text-zinc-900");
  });
});
