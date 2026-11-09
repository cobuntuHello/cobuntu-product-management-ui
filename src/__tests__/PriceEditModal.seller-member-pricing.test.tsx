import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * memberPricingScope="seller" (2026-11-09): a seller's own product priced for
 * the members of the community it is listed in.
 *
 *   1. Tiers come from GET /member-pricing/segments (the community's public
 *      tiers), never from the leaders' GET /segments, which 403s a member.
 *   2. The section says the community approves the price with the listing.
 *   3. When the backend answers sentForReview (a change to a live listing),
 *      the save toast says the listing went back for review.
 *
 * Same fixtures as PriceEditModal.member-pricing-roundtrip.test.tsx.
 */

const product = {
  id: "p-1",
  name: "Success Talks",
  price: 27500,
  currency: "EUR",
  isRecurring: false,
  recurringInterval: "monthly",
  donationConfig: null,
};

const tier = {
  id: "tier-1",
  name: "Guest",
  capacity: null,
  salesCount: 0,
  priceMode: "fixed",
  pwywMinAmount: null,
  products: { id: "tp-1", price: 27500, currency: "EUR", isRecurring: false, recurringInterval: null },
};

const publicTiers = [{ id: "seg-1", name: "Community", color: null }];

const sellerProps = (showToast = vi.fn()) => ({
  product,
  communityTag: "pbn",
  productId: "p-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast,
  showMemberPricing: true,
  memberPricingScope: "seller" as const,
});

function loadRoutes() {
  return [
    { method: "GET", url: /\/api\/communities\/pbn\/products\/p-1\/tiers$/, body: [tier] },
    { method: "GET", url: /\/api\/communities\/pbn\/tiers\/tier-1\/form$/, status: 404, body: {} },
    { method: "GET", url: /\/api\/communities\/pbn\/member-pricing\/segments$/, body: publicTiers },
    { method: "GET", url: /\/api\/communities\/pbn\/tiers\/tier-1\/member-pricing$/, body: [] },
    { method: "GET" as const, url: /\/api\/communities\/pbn\/stripe\/connected$/, body: { connected: true, chargesEnabled: true } },
  ];
}

describe("PriceEditModal: seller member pricing", () => {
  it("loads the community's public tiers, not the leaders' segment list", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(loadRoutes());
    renderWithConfig(<PriceEditModal {...sellerProps()} />);
    await user.click(await screen.findByRole("button", { name: /Guest/ }));
    expect(await screen.findByLabelText(/Offer member pricing for Community/)).toBeInTheDocument();

    const urls = fetchFn.mock.calls.map(([url]: any) => url.toString());
    expect(urls.some((u: string) => /\/pbn\/member-pricing\/segments$/.test(u))).toBe(true);
    expect(urls.some((u: string) => /\/pbn\/segments$/.test(u))).toBe(false);
  });

  it("says the community approves the price with the listing", async () => {
    const user = userEvent.setup();
    mockFetch(loadRoutes());
    renderWithConfig(<PriceEditModal {...sellerProps()} />);
    await user.click(await screen.findByRole("button", { name: /Guest/ }));
    expect(await screen.findByText(/approves it with your listing/i)).toBeInTheDocument();
  });

  it("tells the seller when a save sent the live listing back for review", async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    mockFetch([
      ...loadRoutes(),
      { method: "PUT", url: /\/products\/p-1\/tiers\/tier-1$/, body: tier },
      {
        method: "POST",
        url: /\/api\/communities\/pbn\/tiers\/tier-1\/member-pricing$/,
        body: { id: "ov-new", sentForReview: true },
      },
    ]);
    renderWithConfig(<PriceEditModal {...sellerProps(showToast)} />);
    await user.click(await screen.findByRole("button", { name: /Guest/ }));
    await user.click(await screen.findByLabelText(/Offer member pricing for Community/));
    const valueInput = screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: "20" } });
    await user.click(screen.getByRole("button", { name: "Pricing tiers" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/back with the community for review/i));
    });
  });
});
