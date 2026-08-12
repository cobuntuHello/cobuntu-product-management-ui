import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { CategoryEditModal } from "../components/CategoryEditModal";

/**
 * The category picker, expanded in place.
 *
 * It used to be a row that opened its OWN dialog — so choosing a category from
 * inside the category modal meant a modal on a modal, then a third step for
 * the sub-category. Three surfaces to set one field.
 */

const CATEGORIES = [
  { id: "c1", name: "Coaching", subcategories: [{ id: "s1", name: "1:1" }, { id: "s2", name: "Group" }] },
  { id: "c2", name: "Courses", subcategories: [{ id: "s3", name: "Self-paced" }] },
  { id: "c3", name: "Templates", iconId: "mdi:file-document" },
  { id: "c4", name: "Retreats", imageUrl: "https://x.test/r.png" },
];

function render(over: Partial<React.ComponentProps<typeof CategoryEditModal>> = {}) {
  return renderWithConfig(
    <CategoryEditModal
      productId="p1"
      categories={CATEGORIES as any}
      categoryId={null}
      subCategoryId={null}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      showToast={vi.fn()}
      {...over}
    />,
  );
}

beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CategoryEditModal", () => {
  it("lists every category up front, no second modal", async () => {
    render();
    expect(screen.getByText("Coaching")).toBeInTheDocument();
    expect(screen.getByText("Courses")).toBeInTheDocument();
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Retreats")).toBeInTheDocument();
    // Sub-categories stay folded until asked for.
    expect(screen.queryByText("1:1")).not.toBeInTheDocument();
  });

  it("reveals sub-categories when a category is tapped", async () => {
    render();
    await userEvent.click(screen.getByText("Coaching"));
    expect(screen.getByText("1:1")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    // Only that branch — the other stays shut.
    expect(screen.queryByText("Self-paced")).not.toBeInTheDocument();
  });

  it("selects and de-selects a sub-category", async () => {
    render();
    await userEvent.click(screen.getByText("Coaching"));
    const sub = screen.getByText("1:1").closest("button")!;
    await userEvent.click(sub);
    expect(sub.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(sub);
    expect(sub.getAttribute("aria-pressed")).toBe("false");
  });

  it("lets a childless category be the choice on its own", async () => {
    // A one-level taxonomy is a real configuration; making those rows inert
    // would leave such a community unable to file anything.
    render();
    const leaf = screen.getByText("Templates").closest("button")!;
    await userEvent.click(leaf);
    expect(leaf.className).toContain("bg-zinc-100");
  });

  it("clears the sub-category when the category changes", async () => {
    // Sub-categories have exactly one parent; keeping the old one would submit
    // a pair the backend rejects.
    render({ categoryId: "c1", subCategoryId: "s1" });
    await userEvent.click(screen.getByText("Courses"));
    expect(screen.queryByText("1:1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Self-paced"));
    expect(screen.getByText("Self-paced").closest("button")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("opens on the branch that holds the current selection", async () => {
    // Reopening should show you where you already are, not a collapsed list.
    render({ categoryId: "c1", subCategoryId: "s2" });
    expect(screen.getByText("Group")).toBeInTheDocument();
  });

  it("offers a way back to uncategorised", async () => {
    render({ categoryId: "c1", subCategoryId: "s1" });
    expect(screen.getByText("Clear selection")).toBeInTheDocument();
  });

  it("hides the clear action when nothing is chosen", () => {
    render();
    expect(screen.queryByText("Clear selection")).not.toBeInTheDocument();
  });

  it("saves both ids together", async () => {
    const fetchMock = mockFetch([{ method: "PATCH", url: /users\/me\/products/, body: {} }]);
    const onSaved = vi.fn();
    render({ categoryId: "c1", subCategoryId: "s1", onSaved });
    await userEvent.click(screen.getByText("Save"));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body).toEqual({ categoryId: "c1", subCategoryId: "s1" });
  });
});

describe("category icons", () => {
  /*
   * Categories carry `imageUrl`, an Iconify `iconId` and an `iconColor` — and
   * sub-categories carry all three too. None were rendered here, so an admin
   * could set an icon in the admin app and never see it in the product flow.
   */
  it("renders an uploaded image when there is one", () => {
    render();
    expect(document.querySelector('img[src="https://x.test/r.png"]')).not.toBeNull();
  });

  it("falls back to a folder rather than a broken glyph", () => {
    // An id without a colon is not an Iconify id. "Coaching" has neither
    // field, so it must still get something.
    const { container } = render();
    const row = screen.getByText("Coaching").closest("button")!;
    expect(row.querySelector("svg")).not.toBeNull();
    expect(container).toBeTruthy();
  });

  it("gives sub-categories their own icon slot", async () => {
    render();
    await userEvent.click(screen.getByText("Coaching"));
    const sub = screen.getByText("1:1").closest("button")!;
    expect(sub.querySelector("svg,img")).not.toBeNull();
  });
});
