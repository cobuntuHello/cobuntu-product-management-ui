import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ManageAccessProvider } from "../lib/manageAccess";
import { PricingView } from "../page/views/PricingView";

/**
 * The Discount codes card on the Pricing tab (backend
 * docs/features/discount-codes.md, Phase 3): mounted for editors with this
 * product's endpoint and tiers, and not at all for a read-only viewer.
 */
vi.mock("@cobuntu/management-ui-shared", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    DiscountCodesSection: (props: any) => (
      <div data-testid="discount-codes">
        <span data-testid="dc-endpoint">{JSON.stringify({ ...props.endpoint, headers: undefined })}</span>
        <span data-testid="dc-tiers">{JSON.stringify(props.tiers)}</span>
        <span data-testid="dc-currency">{props.currency}</span>
        <span data-testid="dc-url">{props.itemUrl}</span>
      </div>
    ),
  };
});
vi.mock("../components/PriceEditModal/DonationsSection", () => ({ DonationsSection: () => <div />, DonationsHeading: () => null }));
vi.mock("../components/PriceEditModal", () => ({ PriceEditModal: () => <div /> }));

const product = {
  id: "p-1", name: "Playbook", productType: "DIGITAL",
  tiers: [{ id: "v-a", name: "Standard", products: { price: 2500, currency: "GBP" } }],
};

function renderView(canEdit: boolean, publicUrlBase?: string) {
  renderWithConfig(
    <ManageAccessProvider canEdit={canEdit}>
      <PricingView product={product} productId="p-1" communityTag="demo" onUpdate={vi.fn()} showToast={vi.fn()} showMemberPricing publicUrlBase={publicUrlBase} />
    </ManageAccessProvider>,
  );
}

describe("PricingView discount codes", () => {
  it("mounts the card for an editor, with this product's endpoint, tiers and currency", () => {
    renderView(true);
    expect(JSON.parse(screen.getByTestId("dc-endpoint").textContent!)).toMatchObject({ communityTag: "demo", item: { kind: "product", id: "p-1" } });
    expect(JSON.parse(screen.getByTestId("dc-tiers").textContent!)).toEqual([{ id: "v-a", name: "Standard", currency: "GBP" }]);
    expect(screen.getByTestId("dc-currency").textContent).toBe("GBP");
  });

  it("gives the card the item's public page, for a code's share link", () => {
    renderView(true);
    expect(screen.getByTestId("dc-url").textContent).toBe("https://demo.cobuntu.com/marketplace/p-1");
  });

  it("uses a course's /learning/ page when the host says so", () => {
    renderView(true, "/learning/");
    expect(screen.getByTestId("dc-url").textContent).toBe("https://demo.cobuntu.com/learning/p-1");
  });

  it("is absent for a read-only viewer", () => {
    renderView(false);
    expect(screen.queryByTestId("discount-codes")).toBeNull();
  });
});
