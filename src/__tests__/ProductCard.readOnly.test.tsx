import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { ProductCard } from "../page/sections/ProductCard";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";
import { ManageAccessProvider } from "../lib/manageAccess";

/**
 * A read-only Details tab LOOKS read-only.
 *
 * Reported from live use: a leader of a community that CARRIES a member's
 * product opened its Details tab and every field looked editable. They could
 * click the category row and the rest; nothing saved, because the server
 * refuses (and, once the flag reached the page, the editor stopped opening).
 * Either way a control that looks live and does nothing reads as broken.
 *
 * So with `canEdit` false the rows render disabled (no pencil, no hover, not
 * clickable), the image controls go, and empty values stop offering to add
 * things. The values themselves stay readable.
 */

const handlers = () => ({
  onEditName: vi.fn(),
  onEditMedia: vi.fn(),
  onEditCta: vi.fn(),
  onEditTags: vi.fn(),
  onEditCategory: vi.fn(),
  onEditValueLines: vi.fn(),
});

const product = {
  id: "p1",
  name: "Community Builder Pack",
  price: 1999,
  currency: "USD",
  media: [
    { id: "m1", url: "https://example.com/1.jpg", order: 0 },
    { id: "m2", url: "https://example.com/2.jpg", order: 1 },
  ],
};

function renderCard(canEdit: boolean, over: Record<string, any> = {}) {
  const h = handlers();
  const utils = renderWithConfig(
    <ManageAccessProvider canEdit={canEdit}>
      <ProductCard product={{ ...product, ...over }} communityTag="avepark" listingId={null} {...h} />
    </ManageAccessProvider>,
  );
  return { ...utils, h };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch([{ method: "GET", url: /.*/, body: {} }]);
});

describe("the product card for a viewer who may not edit", () => {
  it("renders every field row disabled, and clicking one opens nothing", async () => {
    const { h } = renderCard(false);

    for (const label of ["Community Builder Pack", "Button text", "Category", "Tags", "What buyers get"]) {
      const row = screen.getByText(label).closest("[aria-disabled]");
      expect(row, `${label} row should be marked disabled`).not.toBeNull();
      expect(row!.getAttribute("aria-disabled")).toBe("true");
      // Not a button: nothing to press, nothing to tab to.
      expect(row!.tagName).not.toBe("BUTTON");
      await userEvent.click(row as HTMLElement);
    }
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
  });

  it("drops the image controls but still shows the images", () => {
    const { container } = renderCard(false);
    expect(screen.queryByLabelText(/Manage images|Add images/)).toBeNull();
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toContain("https://example.com/1.jpg");
    expect(srcs).toContain("https://example.com/2.jpg");
  });

  it("does not invite them to add what they cannot add", () => {
    renderCard(false, { media: [], tags: [] });
    expect(screen.queryByText("Add your first image")).toBeNull();
    expect(screen.getByText("No images yet")).toBeInTheDocument();
    expect(screen.queryByText("Add tags")).toBeNull();
    expect(screen.getByText("No tags")).toBeInTheDocument();
    expect(screen.queryByText("Add what buyers get")).toBeNull();
  });
});

describe("the product card for someone who may edit (unchanged)", () => {
  it("keeps the rows as live buttons that open their editor", async () => {
    const { h } = renderCard(true);
    const nameRow = screen.getByText("Community Builder Pack").closest("button");
    expect(nameRow).not.toBeNull();
    expect(nameRow!.getAttribute("aria-disabled")).toBeNull();
    await userEvent.click(nameRow!);
    expect(h.onEditName).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText(/Manage images|Add images/).length).toBeGreaterThan(0);
  });
});

describe("the quick actions above the card", () => {
  const cards = (readOnly: boolean) => {
    const fns = { onShare: vi.fn(), onSettings: vi.fn(), onDelete: vi.fn() };
    render(<OverviewActionCards isSellable readOnly={readOnly} {...fns} />);
    return fns;
  };
  const button = (label: string) => screen.getByText(label).closest("button")!;

  it("disables Settings and Delete for a read-only viewer, and leaves Share live", async () => {
    const fns = cards(true);
    expect(button("Settings")).toBeDisabled();
    expect(button("Delete Product")).toBeDisabled();
    expect(button("Share Product")).not.toBeDisabled();
    await userEvent.click(button("Share Product"));
    expect(fns.onShare).toHaveBeenCalledTimes(1);
    expect(fns.onSettings).not.toHaveBeenCalled();
    expect(fns.onDelete).not.toHaveBeenCalled();
  });

  it("leaves all three live for someone who may edit", () => {
    cards(false);
    expect(button("Settings")).not.toBeDisabled();
    expect(button("Delete Product")).not.toBeDisabled();
  });
});
