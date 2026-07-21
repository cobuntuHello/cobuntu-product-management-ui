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

    // L2 → click Pricing configuration SectionCard → L3. Member pricing is
    // folded into the pricing-config step in the product modal (no separate
    // tile), so this is where the per-segment override rows live.
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));

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

    // Back to L2 hub via the footer Back button. MembersStep is the
    // same instance — modal-level state map keeps the dirty row.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Pricing configuration/ })).toBeInTheDocument(),
    );

    // The hub is a pure menu with no Save — Back once more to the tier list
    // (L1), where the outer Save lives.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));

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

  it("re-entering Members step shows the previously-toggled state (mount stability)", async () => {
    const user = userEvent.setup();
    mockFetch(stubLoadRoutes());
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 → row → L2 → click Pricing configuration card → L3.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));

    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);
    expect(vipsCheckbox).toBeChecked();

    // Footer Back → L2, then re-enter Pricing configuration.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));

    const vipsAfter = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    expect(vipsAfter).toBeChecked();
  });

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

    // L1 → row → L2 → Pricing configuration card → L3 → dirty.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));

    await user.click(
      await screen.findByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });
    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // Back to L2, then back to L1 (tiers) via the footer Back button.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await user.click(screen.getByRole("button", { name: /^Back$/ }));

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
