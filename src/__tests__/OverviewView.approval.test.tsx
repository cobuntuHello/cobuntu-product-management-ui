import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { OverviewView } from "../page/views/OverviewView";

/**
 * The approval toggle. It was app-local before the page moved into the
 * package, and moving it is exactly when a control like this goes missing —
 * so these tests pin that it exists, and that its FAILURE path is honest.
 *
 * A toggle that stays flipped after a failed save is worse than one that never
 * moved: the seller believes purchases are gated when they are not, and that
 * is a money question.
 */

const product = { id: "p1", name: "Thing", price: 1000, currency: "EUR", requiresApproval: false };

function renderView(over: Record<string, any> = {}) {
  return renderWithConfig(
    <OverviewView
      product={product}
      communityTag="avepark"
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

beforeEach(() => {
  mockFetch([{ method: "GET", url: /.*/, body: {} }]);
});

describe("OverviewView — approval toggle", () => {
  it("is absent on a surface that cannot change it", () => {
    // No handler means the viewer has no business flipping it, so no control.
    renderView();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders with the current state when a handler is given", () => {
    renderView({ requiresApproval: true, onSaveApproval: vi.fn() });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("saves the new value", async () => {
    const onSaveApproval = vi.fn().mockResolvedValue(undefined);
    renderView({ requiresApproval: false, onSaveApproval });

    await userEvent.click(screen.getByRole("switch"));

    expect(onSaveApproval).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  });

  it("REVERTS when the save fails", async () => {
    // The regression that matters: leaving it flipped tells the seller their
    // purchases are gated when the server never agreed.
    const onSaveApproval = vi.fn().mockRejectedValue(new Error("nope"));
    renderView({ requiresApproval: false, onSaveApproval });

    await userEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
  });

  it("follows the prop when the product is re-read", async () => {
    // A save elsewhere (the edit drawer) re-fetches the product; the toggle
    // must show what came back, not what it last set locally.
    const { rerender } = renderView({ requiresApproval: false, onSaveApproval: vi.fn() });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    rerender(
      <OverviewView
        product={product}
        communityTag="avepark"
        productId="p1"
        isPublished={false}
        listingId={null}
        onPublish={vi.fn()}
        onUnpublish={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        showToast={vi.fn()}
        requiresApproval
        onSaveApproval={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  });

  it("ignores a second click while a save is in flight", async () => {
    let resolve: () => void = () => {};
    const onSaveApproval = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    renderView({ requiresApproval: false, onSaveApproval });

    const sw = screen.getByRole("switch");
    await userEvent.click(sw);
    await userEvent.click(sw);
    expect(onSaveApproval).toHaveBeenCalledTimes(1);
    resolve();
  });
});

/*
 * The after-checkout gate moved with the card.
 *
 * AfterCheckoutCard is no longer rendered by OverviewView — it is a row inside
 * ProductSettingsDrawer now, alongside the other three community-scoped
 * settings. Its gating is therefore tested where it lives:
 * ProductSettingsGating.test.tsx pins that `hideAfterCheckout` drops that row
 * ALONE while the other three stay, which is the real rule (community-owned
 * for all four, plus MARKETPLACE_CREATE for this one).
 */
