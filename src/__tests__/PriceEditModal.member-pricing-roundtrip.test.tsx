import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Mirror of the events PR #8 slice 7 round-trip test, adapted for
 * marketplace product semantics:
 *   - Tier endpoint is /products/:id/tiers (events: /events/:id/tiers)
 *   - No Stripe gate
 *   - tier.products carries isRecurring + recurringInterval
 *
 * Pins the "MembersStep stays mounted across hub↔step transitions"
 * contract that lets dirty member-pricing rows survive the user
 * clicking Done on the step.
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

    await screen.findByDisplayValue("Pro");
    await user.click(screen.getAllByLabelText(/expand|collapse/i)[0]);

    // Edit buttons order: Basics / Options / Member pricing / Form.
    const editButtons = await screen.findAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[2]);

    // Toggle VIPs override
    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);

    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });

    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // Done returns to the hub. MembersStep stays mounted (slice 7
    // invariant) so the dirty rows survive.
    await user.click(screen.getByRole("button", { name: /Done/i }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /^Edit/ }).length,
      ).toBeGreaterThanOrEqual(4),
    );

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

  it("re-entering Members step shows the previously-toggled state (mount stability)", async () => {
    const user = userEvent.setup();
    mockFetch(stubLoadRoutes());
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await screen.findByDisplayValue("Pro");
    await user.click(screen.getAllByLabelText(/expand|collapse/i)[0]);
    const editButtons = await screen.findAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[2]);

    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);
    expect(vipsCheckbox).toBeChecked();

    await user.click(screen.getByRole("button", { name: /Done/i }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /^Edit/ }).length,
      ).toBeGreaterThanOrEqual(4),
    );
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[2]);

    const vipsAfter = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    expect(vipsAfter).toBeChecked();
  });
});
