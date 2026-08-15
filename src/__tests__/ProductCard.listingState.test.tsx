import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig } from "./test-utils";
import { ProductCard } from "../page/sections/ProductCard";

/**
 * The publish row says what is actually true of the listing.
 *
 * It was a boolean — "Product is published", or "Product is not published yet,
 * click to publish" — over a five-value lifecycle. Every state that was not
 * live shared the false half, and it was wrong in three different ways:
 *
 *   PENDING    the seller did not fail to publish it; a leader has not looked
 *   PAUSED     they took it off the shelf themselves, on purpose
 *   CANCELLED  it was withdrawn, not never-published
 *   REVOKED    the community ended it, and clicking publish CANNOT succeed
 *
 * The last is the one that matters most: the row invited an action the API
 * refuses, so the seller clicks, nothing happens, and there is nothing on the
 * screen telling them why.
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

const product = { id: "p1", name: "Community Builder Pack", price: 1999, currency: "USD", media: [] };

function renderCard(props: Record<string, any> = {}, h = handlers()) {
  const utils = renderWithConfig(
    <ProductCard
      product={product}
      communityTag="avepark"
      isPublished={false}
      listingId={null}
      {...props}
      {...h}
    />,
  );
  return { ...utils, h };
}

beforeEach(() => { cleanup(); });

describe("the publish row names the real state", () => {
  it("says a leader has it, not that the seller failed to publish", () => {
    renderCard({ listingStatus: "PENDING" });
    expect(screen.getByText("Waiting on the community")).toBeTruthy();
    expect(screen.queryByText("Product is not published yet")).toBeNull();
  });

  it("credits the seller for pausing it themselves", () => {
    renderCard({ listingStatus: "PAUSED" });
    expect(screen.getByText("You took it off the shelf")).toBeTruthy();
  });

  it("says withdrawn, and points at where to ask again", () => {
    renderCard({ listingStatus: "CANCELLED" });
    expect(screen.getByText("This listing was withdrawn")).toBeTruthy();
  });

  it("tells a revoked seller nobody is reviewing it", () => {
    /*
     * The state with the highest cost of being wrong: under the old copy this
     * read "not published yet", so the seller's reasonable next move was to
     * wait, and nothing was coming.
     */
    renderCard({ listingStatus: "REVOKED" });
    expect(screen.getByText("The community ended this listing")).toBeTruthy();
  });
});

describe("a closed listing is not a button", () => {
  it("does not offer to publish a REVOKED listing", async () => {
    // The API refuses it. Offering the click promises an action that fails
    // silently, which is worse than not offering it.
    const { h } = renderCard({ listingStatus: "REVOKED" });
    await userEvent.click(screen.getByText("The community ended this listing"));
    expect(h.onPublish).not.toHaveBeenCalled();
    expect(h.onUnpublish).not.toHaveBeenCalled();
  });

  it("does not offer to publish a CANCELLED listing", async () => {
    const { h } = renderCard({ listingStatus: "CANCELLED" });
    await userEvent.click(screen.getByText("This listing was withdrawn"));
    expect(h.onPublish).not.toHaveBeenCalled();
  });

  it("still lets a PAUSED listing be put back", async () => {
    // The gate must not swallow the states that ARE actionable: pausing is
    // the seller's own move and theirs to undo.
    const { h } = renderCard({ listingStatus: "PAUSED" });
    await userEvent.click(screen.getByText("You took it off the shelf"));
    expect(h.onPublish).toHaveBeenCalled();
  });
});

describe("a caller that passes no status keeps the old behaviour", () => {
  /*
   * The admin app does not pass listingStatus and must not change. These two
   * pin the legacy path byte-for-byte, because widening a shared component is
   * only safe if the callers that never asked for it are untouched.
   */
  it("reads published when isPublished is true", () => {
    renderCard({ isPublished: true });
    expect(screen.getByText("Product is published")).toBeTruthy();
    expect(screen.getByText("Click to unpublish")).toBeTruthy();
  });

  it("reads not-published when isPublished is false", () => {
    renderCard({ isPublished: false });
    expect(screen.getByText("Product is not published yet")).toBeTruthy();
    expect(screen.getByText("Click to publish")).toBeTruthy();
  });

  it("still fires publish on click", async () => {
    const { h } = renderCard({ isPublished: false });
    await userEvent.click(screen.getByText("Product is not published yet"));
    expect(h.onPublish).toHaveBeenCalled();
  });
});
