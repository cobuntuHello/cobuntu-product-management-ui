import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { DetailsView } from "../page/views/DetailsView";

/**
 * Every row on the Overview tab must actually OPEN its editor.
 *
 * THE REGRESSION THIS EXISTS FOR: an edit that removed the approval card
 * sliced from `{onSaveApproval && (` to `{canConfigureSettings && (` — and
 * every modal branch lived between those two markers. Name, price,
 * description, button text, media, share, delete, unpublish and the edit
 * drawer were all deleted in one go, and it SHIPPED.
 *
 * Nothing caught it. The card's own tests assert that a row calls its
 * handler, which stayed true the whole time: the handler set state that
 * nothing rendered from. The only test that would have failed is this one —
 * click the row, expect a dialog — so it is the one that should have existed
 * from the start.
 */

const product = {
  id: "p1",
  name: "dawdwad",
  price: 0,
  currency: "EUR",
  description: "",
  media: [],
};

function renderOverview(over: Record<string, any> = {}) {
  return renderWithConfig(
    <DetailsView
      product={product}
      communityTag="belaescala"
      productId="p1"
      isPublished={false}
      listingId={null}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      showToast={vi.fn()}
      {...over}
    />,
  );
}

/** Any of the package's modal shells, however each one is built. */
async function expectSomethingOpened() {
  await waitFor(
    () => {
      const opened =
        document.querySelector('[role="dialog"]') ||
        document.querySelector(".fixed.inset-0");
      expect(opened).toBeTruthy();
    },
    { timeout: 3000 },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch([
    { method: "GET", url: /\/tiers/, body: [] },
    { method: "GET", url: /.*/, body: {} },
  ]);
});

describe("every Overview row opens its editor", () => {
  it("name", async () => {
    renderOverview();
    await userEvent.click(screen.getByText("dawdwad"));
    await expectSomethingOpened();
  });

  it("price", async () => {
    renderOverview();
    await userEvent.click(screen.getByText("Free"));
    await expectSomethingOpened();
  });

  it("description — no longer a modal, and no longer a row", async () => {
    /*
     * Deliberate. Client feedback: the short fields are fine in a row because
     * you see them whole, but a description is paragraphs, so one truncated
     * line showed almost nothing and was a permanent instruction to click.
     *
     * It now renders as a full-width section below the card with the editor
     * already open, so there is no row to click and no dialog to open. Kept as
     * an assertion rather than deleted, so the row cannot quietly come back
     * alongside the section and give two ways to edit one field.
     */
    renderOverview();
    expect(screen.queryByText("Add a description")).not.toBeInTheDocument();
  });

  it("button text", async () => {
    renderOverview();
    await userEvent.click(screen.getByText(/Buy now \(default\)/));
    await expectSomethingOpened();
  });

  it("media", async () => {
    renderOverview();
    await userEvent.click(screen.getAllByLabelText(/Manage images|Add images/)[0]);
    await expectSomethingOpened();
  });

  it("delete", async () => {
    renderOverview();
    await userEvent.click(screen.getByText("Delete Product"));
    await expectSomethingOpened();
  });

  it("share", async () => {
    // Share is disabled until published — publish it so the action is live.
    renderOverview({ isPublished: true });
    await userEvent.click(screen.getByText("Share Product"));
    await expectSomethingOpened();
  });
});

describe("the branches exist at all", () => {
  it("renders a branch for every modal key the card can set", async () => {
    /*
     * A structural backstop for the failure mode above: the rows set a key,
     * and if no branch reads that key the click is silently inert. Asserted on
     * the source so a deleted branch fails here even if the interaction test
     * above is skipped or the row moves.
     */
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../page/views/DetailsView.tsx"), "utf8");
    /*
     * "description" and "unpublish" are absent BY DESIGN, not by omission.
     * "description" left the ProductModal union when the description moved to
     * an inline section; "unpublish" left when publishing was retired (see
     * below). Every key that still exists must still have a branch.
     */
    for (const key of [
      "name", "price", "share", "distribution", "delete",
      "cta", "media", "tags", "category",
    ]) {
      expect(src).toContain(`modal === "${key}"`);
    }

    /*
     * REVERSED: publishing is retired, so its branch must be ABSENT.
     *
     * Nothing ever called `onPublish` and nothing ever set the "unpublish"
     * key, so the confirm modal was unreachable and the two props were dead
     * weight the host had to satisfy. The endpoints they posted to
     * (POST .../products/:id/{publish,unpublish}) were deleted from the
     * backend first. A listing's visibility is managed in the Listings tab.
     */
    expect(src).not.toContain('modal === "unpublish"');
    expect(src).not.toContain("await onUnpublish()");
    // The props are gone from the interface, not merely unused by the body.
    expect(src).not.toMatch(/^\s*onUnpublish[,:]/m);
    expect(src).not.toMatch(/^\s*onPublish[,:]/m);

    /*
     * REVERSED: the drawer must now be ABSENT.
     *
     * "Edit Product" opened the whole create form to change one field, and
     * every property it held has its own row now. It was also mounted TWICE
     * in this component — two live drawers over one product — which is the
     * sort of thing a second, competing edit route hides.
     */
    expect(src).not.toContain("<EditProductDrawer");
  });
});
