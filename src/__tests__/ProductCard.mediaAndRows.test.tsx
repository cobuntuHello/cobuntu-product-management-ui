import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("keeps the strip's height with no images, so the column does not jump", () => {
    const { container } = renderCard({ media: [] });
    expect(container.querySelectorAll(".aspect-square").length).toBe(4);
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
