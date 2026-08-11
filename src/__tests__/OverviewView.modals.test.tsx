import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { OverviewView } from "../page/views/OverviewView";

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
    <OverviewView
      product={product}
      communityTag="belaescala"
      productId="p1"
      isPublished={false}
      listingId={null}
      onPublish={vi.fn()}
      onUnpublish={vi.fn()}
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

  it("description", async () => {
    renderOverview();
    await userEvent.click(screen.getByText("Add a description"));
    await expectSomethingOpened();
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
    const src = readFileSync(resolve(__dirname, "../page/views/OverviewView.tsx"), "utf8");
    for (const key of ["name", "price", "share", "distribution", "delete", "unpublish", "description", "cta", "media"]) {
      expect(src).toContain(`modal === "${key}"`);
    }
    expect(src).toContain("<EditProductDrawer");
  });
});
