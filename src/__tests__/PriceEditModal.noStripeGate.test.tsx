import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * REGRESSION GUARD: editing a price must never be gated on a payment account.
 *
 * The modal used to replace the entire tier editor with a "Connect Stripe"
 * warning whenever the community had no connected account and any tier was
 * paid. Three separate faults, all of which these tests pin against:
 *
 *   1. WRONG MOMENT. Editing a price is not when money moves. A seller could
 *      create a paid product and then be locked out of fixing a typo in its
 *      own price. The real gate belongs at LISTING time and lives server-side,
 *      where the applicable commission rate is actually known.
 *
 *   2. WRONG ACCOUNT, UNFIXABLE. It tested the COMMUNITY's Stripe account, but
 *      the "Connect Stripe" button it offered linked to the current USER's
 *      payouts onboarding. Completing that flow could not satisfy the check
 *      that raised it.
 *
 *   3. USUALLY NOT EVEN TRUE. The status endpoint is gated on ACCESS_ADMIN_APP
 *      and the hook mapped ANY error to `chargesEnabled: false`, so for every
 *      non-admin member a 403 read as "this community has no payment account"
 *      regardless of the truth.
 *
 * Why this file exists at all: the old suite could not have caught any of it,
 * because test-utils shipped a default `/stripe/connected` stub answering
 * `{ connected: true, chargesEnabled: true }`. Every test ran the happy path.
 * That default is now gone — which is also why these tests assert the endpoint
 * is never requested, not merely that the warning is absent.
 */

const paidProduct = {
  price: 2500,
  currency: "EUR",
  isRecurring: false,
  recurringInterval: "monthly",
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product: paidProduct,
  productId: "prod_1",
  communityTag: "orbis",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

/** One paid tier — the exact shape that used to trip the gate. */
const paidTiersRoute = {
  method: "GET",
  url: /\/api\/products\/prod_1\/tiers$/,
  body: [
    {
      id: "tier_1",
      name: "Standard",
      price: 2500,
      currency: "EUR",
      salesCount: 0,
    },
  ],
};

describe("PriceEditModal — no Stripe gate on edit", () => {
  it("opens the tier editor for a PAID product and never asks about Stripe", async () => {
    const fetchFn = mockFetch([paidTiersRoute]);

    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // The editor itself renders — the paid tier is reachable and editable.
    await screen.findByRole("button", { name: /Standard/ });

    // The warning that used to replace it is nowhere.
    expect(screen.queryByText(/Connect Stripe/i)).toBeNull();
    expect(
      screen.queryByText(/doesn't have a payment account/i),
    ).toBeNull();

    // And the admin-only status endpoint is never called. This is the
    // load-bearing assertion: with the default stub removed, any request for
    // it would throw "Unmocked fetch" rather than silently pass.
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /\/stripe\/connected$/.test(u))).toBe(false);
  });

  it("opens the editor even when the tier fetch is the only call made", async () => {
    // Guards against the gate being reintroduced behind a different flag: the
    // modal's mount-time network surface should be the tiers read, nothing
    // payment-related.
    const fetchFn = mockFetch([paidTiersRoute]);

    renderWithConfig(<PriceEditModal {...baseProps()} />);
    await screen.findByRole("button", { name: /Standard/ });

    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => !/stripe/i.test(u))).toBe(true);
  });

  it("still opens the editor for a FREE product", async () => {
    // The free path was never gated; this pins that removing the gate did not
    // disturb it.
    const fetchFn = mockFetch([
      {
        method: "GET",
        url: /\/api\/products\/prod_1\/tiers$/,
        body: [
          {
            id: "tier_free",
            name: "Standard",
            price: 0,
            currency: "EUR",
            salesCount: 0,
          },
        ],
      },
    ]);

    renderWithConfig(
      <PriceEditModal {...baseProps({ product: { ...paidProduct, price: 0 } })} />,
    );

    await screen.findByRole("button", { name: /Standard/ });
    expect(screen.queryByText(/Connect Stripe/i)).toBeNull();

    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /\/stripe\/connected$/.test(u))).toBe(false);
  });
});
