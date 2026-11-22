/**
 * T-376 (2026-11-22): a collaborator may edit a community-owned product, but
 * who can see it, who can buy it, the landing page and after checkout stay
 * with a MARKETPLACE_CREATE leader of the owning community. The product read
 * says so in `viewerCanConfigureCommunity`; an explicit false shows those rows
 * locked with one line on who can change them, instead of editors whose save
 * would 403. Absent keeps today's editable rows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { ProductSettingsDrawer } from "../page/ProductSettingsDrawer";

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch([{ method: "GET", url: /.*/, body: {} }]);
});

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1", communityId: "c1", viewability: "PUBLIC", accessibility: "PUBLIC",
  externalDetailUrl: null, price: 1000, ...over,
});
function drawer(p: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return renderWithConfig(
    <ProductSettingsDrawer product={p} communityTag="fsc" productId="p1" isOpen
      onClose={vi.fn()} onSaved={vi.fn()} showToast={vi.fn()} {...extra} />,
  );
}

describe("a collaborator who is not a community leader", () => {
  it("sees the community settings locked, with who can change them", () => {
    drawer(product({ viewerCanConfigureCommunity: false }));
    expect(screen.getByTestId("community-settings-locked-note")).toHaveTextContent(
      "Only community leaders with marketplace permissions can change these.",
    );
    for (const label of ["Visibility", "Access", "Distribution", "After checkout"]) {
      const row = screen.getByText(label).closest("[data-locked]");
      expect(row, label).not.toBeNull();
    }
  });

  it("cannot open their editors", async () => {
    drawer(product({ viewerCanConfigureCommunity: false }));
    await userEvent.click(screen.getByText("Visibility"));
    expect(screen.getAllByText("Visibility")).toHaveLength(1);
  });

  it("sees After checkout locked even when the consumer hides it", () => {
    drawer(product({ viewerCanConfigureCommunity: false }), { hideAfterCheckout: true });
    expect(screen.getByText("After checkout").closest("[data-locked]")).not.toBeNull();
  });
});

describe("a leader, or a payload that never said", () => {
  it("explicit true: editable, no note", () => {
    drawer(product({ viewerCanConfigureCommunity: true }));
    expect(screen.queryByTestId("community-settings-locked-note")).toBeNull();
    expect(screen.getByText("Visibility").closest("button")).not.toBeNull();
  });
  it("absent: today's behaviour", () => {
    drawer(product());
    expect(screen.queryByTestId("community-settings-locked-note")).toBeNull();
    expect(screen.getByText("Visibility").closest("button")).not.toBeNull();
  });
});

describe("a personal product", () => {
  it("has no community rows and no lock note", () => {
    drawer(product({ communityId: null, viewerCanConfigureCommunity: false }));
    expect(screen.queryByText("Visibility")).toBeNull();
    expect(screen.queryByTestId("community-settings-locked-note")).toBeNull();
  });
});
