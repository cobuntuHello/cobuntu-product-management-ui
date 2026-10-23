import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ManageAccessProvider } from "../lib/manageAccess";
import { PricingView } from "../page/views/PricingView";

/**
 * The Pricing tab: the create wizard's variant list, on the manage page.
 * Sibling of the event package's PricingView.test.tsx, and it pins the same
 * three things that are easy to get wrong and invisible when they are:
 *
 *  1. Money. Prices arrive in the SMALLEST UNIT, so a raw read renders 2500 as
 *     "2500.00" instead of "25.00" -- a hundredfold error on the one number a
 *     seller checks, and the markup looks perfectly fine when it happens.
 *
 *  2. The drill-in contract. A card must open the editor on THAT variant, not
 *     on the modal's own list. It works because saved tiers reuse their backend
 *     id as `localId`, an invariant of the modal's loader rather than anything
 *     this view controls.
 *
 *  3. The read-only gate. A leader of a community that merely CARRIES someone
 *     else's product must not reprice it. The sibling guard only proves this
 *     file CALLS useCanEdit; it cannot prove the call changes anything.
 */

vi.mock("../components/PriceEditModal/DonationsSection", () => ({
  DonationsSection: ({ onUpdate, defaultCurrency }: any) => (
    <div data-testid="donations">
      <span data-testid="donations-currency">{defaultCurrency}</span>
      <button type="button" onClick={() => onUpdate({ enabled: true })}>
        toggle-donations
      </button>
    </div>
  ),
}));

vi.mock("../components/PriceEditModal", () => ({
  PriceEditModal: (props: any) => (
    <div data-testid="price-modal">
      <span data-testid="open-tier">{String(props.openTierLocalId ?? "")}</span>
      <span data-testid="open-new">{String(!!props.openNewTier)}</span>
      <span data-testid="product-type">{String(props.productType ?? "")}</span>
      <span data-testid="member-pricing">{String(!!props.showMemberPricing)}</span>
    </div>
  ),
}));

function makeProduct(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    productType: "DIGITAL",
    tiers: [
      {
        id: "v-a",
        name: "Standard",
        capacity: 25,
        licenseTerms: "Personal use",
        publishedAt: "2026-10-01T00:00:00.000Z",
        products: { price: 2500, currency: "EUR" },
        tier_forms: [{ id: "f1" }],
      },
      {
        id: "v-b",
        name: "Free sample",
        capacity: null,
        publishedAt: null,
        products: { price: 0, currency: "EUR" },
      },
    ],
    ...over,
  };
}

function renderView(
  { canEdit = true, product = makeProduct(), showMemberPricing = true } = {},
) {
  const onUpdate = vi.fn();
  const showToast = vi.fn();
  // Wrapped in the config provider: PricingView reads apiBaseUrl and the JSON
  // headers to persist donations, so a bare render throws.
  renderWithConfig(
    <ManageAccessProvider canEdit={canEdit}>
      <PricingView
        product={product}
        productId="p-1"
        communityTag="demo"
        onUpdate={onUpdate}
        showToast={showToast}
        showMemberPricing={showMemberPricing}
      />
    </ManageAccessProvider>,
  );
  return { onUpdate, showToast };
}

beforeEach(() => vi.clearAllMocks());

describe("PricingView", () => {
  it("renders a card per variant", () => {
    renderView();
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.getByText("Free sample")).toBeTruthy();
  });

  it("converts the price out of the smallest unit", () => {
    renderView();
    expect(screen.getByText("€25.00")).toBeTruthy();
    expect(screen.queryByText("€2500.00")).toBeNull();
  });

  it("shows a zero price as Free", () => {
    renderView();
    expect(screen.getByText("Free")).toBeTruthy();
  });

  it("labels a recurring price with its interval", () => {
    renderView({
      product: makeProduct({
        tiers: [{
          id: "v-r", name: "Monthly", capacity: null, publishedAt: null,
          products: { price: 1000, currency: "EUR", isRecurring: true, recurringInterval: "monthly" },
        }],
      }),
    });
    expect(screen.getByText("€10.00/mo")).toBeTruthy();
  });

  it("labels pay-what-you-want without inventing a number", () => {
    renderView({
      product: makeProduct({
        tiers: [{
          id: "v-p", name: "Donate", priceMode: "pwyw", capacity: null, publishedAt: null,
          products: { price: 0, currency: "EUR" },
        }],
      }),
    });
    expect(screen.getByText("Pay what you want")).toBeTruthy();
  });

  it("surfaces capacity, licence, form and status as facts", () => {
    renderView();
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("Unlimited")).toBeTruthy();
    expect(screen.getByText("Set")).toBeTruthy();       // licenseTerms present
    expect(screen.getByText("Linked")).toBeTruthy();    // tier_forms present
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("drops the licence fact on a physical product", () => {
    // "Licence: Not set" on a boxed item misleads rather than teaches, which
    // is the rule the wizard's fact strip already follows.
    renderView({ product: makeProduct({ productType: "PHYSICAL" }) });
    expect(screen.queryByText("Licence")).toBeNull();
    // Both variants render a Capacity cell, so this counts rather than
    // assuming one -- getByText throws on more than a single match.
    expect(screen.getAllByText("Capacity").length).toBe(2);
  });

  it("opens the editor on the clicked variant, not the modal's list", () => {
    renderView();
    expect(screen.queryByTestId("price-modal")).toBeNull();
    fireEvent.click(screen.getByText("Free sample"));
    expect(screen.getByTestId("open-tier").textContent).toBe("v-b");
    expect(screen.getByTestId("open-new").textContent).toBe("false");
  });

  it("asks for a brand new variant via openNewTier, with no target id", () => {
    renderView();
    fireEvent.click(screen.getByText("Add variant"));
    expect(screen.getByTestId("open-new").textContent).toBe("true");
    expect(screen.getByTestId("open-tier").textContent).toBe("");
  });

  it("forwards productType so the editor keeps its shape-specific core", () => {
    // COURSE comes through this same view: a course is a product.
    renderView({ product: makeProduct({ productType: "COURSE" }) });
    fireEvent.click(screen.getByText("Standard"));
    expect(screen.getByTestId("product-type").textContent).toBe("COURSE");
  });

  describe("read-only viewer", () => {
    it("still sees the variants", () => {
      renderView({ canEdit: false });
      expect(screen.getByText("Standard")).toBeTruthy();
    });

    it("cannot open one", () => {
      renderView({ canEdit: false });
      fireEvent.click(screen.getByText("Standard"));
      expect(screen.queryByTestId("price-modal")).toBeNull();
    });

    it("is not offered the Add affordance", () => {
      renderView({ canEdit: false });
      expect(screen.queryByText("Add variant")).toBeNull();
    });
  });

  it("passes member pricing through as given", () => {
    renderView({ showMemberPricing: false });
    fireEvent.click(screen.getByText("Standard"));
    expect(screen.getByTestId("member-pricing").textContent).toBe("false");
  });

  it("tolerates a product with no variants", () => {
    renderView({ product: makeProduct({ tiers: undefined }) });
    expect(screen.getByText("Add variant")).toBeTruthy();
  });
});

/**
 * DONATIONS — the other half of the wizard's pricing step.
 *
 * Shipped missing at first: the tab had the variant list and not the donations
 * sidecar. These pin the wiring, and above all that an untouched visit writes
 * NOTHING -- a PUT carrying a cleared config from someone who only came to
 * look is the expensive mistake here.
 */
describe("PricingView donations", () => {
  it("renders the donations sidecar", () => {
    renderView();
    expect(screen.getByTestId("donations")).toBeTruthy();
  });

  it("seeds the currency from the first variant", () => {
    renderView();
    expect(screen.getByTestId("donations-currency").textContent).toBe("EUR");
  });

  it("offers no Save until something actually changed", () => {
    renderView();
    expect(screen.queryByText("Save donations")).toBeNull();
  });

  it("offers Save once a change is made", () => {
    renderView();
    fireEvent.click(screen.getByText("toggle-donations"));
    expect(screen.getByText("Save donations")).toBeTruthy();
  });

  it("PUTs to the product donations endpoint on save", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    renderView();
    fireEvent.click(screen.getByText("toggle-donations"));
    fireEvent.click(screen.getByText("Save donations"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/products/p-1/donations");
    expect(init.method).toBe("PUT");
    vi.unstubAllGlobals();
  });

  it("a read-only viewer cannot change them, so no Save ever appears", () => {
    renderView({ canEdit: false });
    fireEvent.click(screen.getByText("toggle-donations"));
    expect(screen.queryByText("Save donations")).toBeNull();
  });
});
