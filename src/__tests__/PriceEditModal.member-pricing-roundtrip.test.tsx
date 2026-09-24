import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Mirror of the events package round-trip test, adapted for marketplace
 * product semantics:
 *   - Tier endpoint is /products/:id/tiers (events: /events/:id/tiers)
 *   - No Stripe gate
 *   - tier.products carries isRecurring + recurringInterval
 *
 * Pins the "MembersStep stays mounted across hub↔step transitions" and
 * "rows survive L1↔L2 navigation" contracts that let dirty
 * member-pricing rows survive the user backing out of the step OR the
 * tier itself.
 */

const product = {
  id: "p-1",
  name: "Test Product",
  price: 1000,
  currency: "EUR",
  isRecurring: false,
  recurringInterval: "monthly",
  donationConfig: null,
};

const tier = {
  id: "tier-1",
  name: "Pro",
  capacity: null,
  salesCount: 0,
  priceMode: "fixed",
  pwywMinAmount: null,
  products: {
    id: "tp-1",
    price: 1000,
    currency: "EUR",
    isRecurring: false,
    recurringInterval: null,
  },
};

const segments = [
  { id: "seg-1", name: "VIPs" },
  { id: "seg-2", name: "Students" },
];

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product,
  communityTag: "orbis",
  productId: "p-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  showMemberPricing: true,
  ...overrides,
});

function stubLoadRoutes() {
  return [
    {
      method: "GET",
      url: /\/api\/communities\/orbis\/products\/p-1\/tiers$/,
      body: [tier],
    },
    {
      method: "GET",
      url: /\/api\/communities\/orbis\/tiers\/tier-1\/form$/,
      status: 404,
      body: {},
    },
    { method: "GET", url: /\/api\/communities\/orbis\/segments$/, body: segments },
    {
      method: "GET",
      url: /\/api\/communities\/orbis\/tiers\/tier-1\/member-pricing$/,
      body: [],
    },
    // Stripe-status probe — useStripeStatus hits this on mount. Tests
    // exercise the paid-tier editor, so the community is treated as
    // already-connected; the gate path is covered by its own test.
    {
      method: "GET" as const,
      url: /\/api\/communities\/orbis\/stripe\/connected$/,
      body: { connected: true, chargesEnabled: true },
    },
  ];
}

describe("PriceEditModal (product) — Member Pricing round-trip", () => {
  it("dirty rows committed via outer Save after exiting the Members step", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      ...stubLoadRoutes(),
      { method: "PUT", url: /\/products\/p-1\/tiers\/tier-1$/, body: tier },
      {
        method: "POST",
        url: /\/api\/communities\/orbis\/tiers\/tier-1\/member-pricing$/,
        body: { id: "ov-new" },
      },
    ]);

    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 → click tier row → L2 (per-tier hub).
    await user.click(await screen.findByRole("button", { name: /Pro/ }));

    // The per-variant redesign flattened the editor: there is no longer a
    // "Pricing configuration" drill-in below the tier. Member pricing renders
    // INLINE in the variant editor, so L2 is already where the per-segment
    // override rows live.

    // Toggle VIPs override + set value.
    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);

    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });

    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // Back to the tier list (L1), where the outer Save lives. The footer Back
    // button now belongs to the drill-in sub-steps; the way up from the variant
    // editor is the breadcrumb. One hop, and the dirty rows must survive it -
    // the whole point of holding them in the modal's state map rather than
    // inside the section that unmounts.
    await user.click(screen.getByRole("button", { name: "Pricing tiers" }));

    // Outer Save commits both the tier PUT AND the member-pricing POST.
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const post = fetchFn.mock.calls.find(
        ([url, init]: any) =>
          /\/tiers\/tier-1\/member-pricing$/.test(url.toString()) &&
          (init?.method || "GET") === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        segmentId: "seg-1",
        mode: "PERCENT_OFF",
        value: 20,
      });
      // Non-recurring tier: no recurringScope key.
      expect(body).not.toHaveProperty("recurringScope");
    });
  });

  it("keeps Save ENABLED when the community has no segments (regression: was permanently disabled)", async () => {
    // Prod bug: with showMemberPricing + a saved tier + ZERO segments, the
    // per-tier member-pricing fetch effect returns early, so memberPricingByTier
    // never populates → memberPricingPending was stuck true → the Save button was
    // disabled forever (clicking it did nothing, no toast). A no-segment community
    // could not save any product tier.
    mockFetch([
      { method: "GET", url: /\/api\/communities\/orbis\/products\/p-1\/tiers$/, body: [tier] },
      { method: "GET", url: /\/api\/communities\/orbis\/tiers\/tier-1\/form$/, status: 404, body: {} },
      { method: "GET", url: /\/api\/communities\/orbis\/segments$/, body: [] }, // NO segments
      { method: "GET", url: /\/api\/communities\/orbis\/stripe\/connected$/, body: { connected: true, chargesEnabled: true } },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);
    // At the tier list (L1), the outer Save must not be stuck disabled once the
    // tiers have loaded — there is nothing to wait on when there are no segments.
    const saveBtn = await screen.findByRole("button", { name: /^save$/i });
    await waitFor(() => expect(saveBtn).not.toBeDisabled());
  });

  /*
   * REMOVED: "re-entering Members step shows the previously-toggled state
   * (mount stability)".
   *
   * It pinned state surviving the L2 hub ↔ L3 pricing-config transition. The
   * per-variant redesign flattened the editor and that transition no longer
   * exists, so the test could only ever have been kept alive by pointing it at
   * a different hop - which would have made it a duplicate of the L1 ↔ L2 test
   * below, not a check of anything new.
   *
   * The surviving property (dirty rows outlive leaving and re-entering the
   * variant) is covered by that test.
   */

  it("leaving the tier (back to tiers) mid-edit no longer drops the dirty rows (papercut #1 fix)", async () => {
    // Pre-state-lift: rows lived inside MemberPricingSection. Leaving
    // the tier (back-arrow up to L1) unmounted the section + dropped
    // any pending dirty rows. Post-lift: rows live in PriceEditModal's
    // state map and survive Level 1 ↔ Level 2 navigation.
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      ...stubLoadRoutes(),
      { method: "PUT", url: /\/products\/p-1\/tiers\/tier-1$/, body: tier },
      {
        method: "POST",
        url: /\/api\/communities\/orbis\/tiers\/tier-1\/member-pricing$/,
        body: { id: "ov-new" },
      },
    ]);

    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 → row → L2 (the variant editor, member pricing inline) → dirty.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));

    await user.click(
      await screen.findByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });
    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // Back to L1 (the tier list) via the breadcrumb.
    await user.click(screen.getByRole("button", { name: "Pricing tiers" }));

    // Save from L1 — the dirty member-pricing row should commit.
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const post = fetchFn.mock.calls.find(
        ([url, init]: any) =>
          /\/tiers\/tier-1\/member-pricing$/.test(url.toString()) &&
          (init?.method || "GET") === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        segmentId: "seg-1",
        mode: "PERCENT_OFF",
        value: 20,
      });
    });
  });
});
