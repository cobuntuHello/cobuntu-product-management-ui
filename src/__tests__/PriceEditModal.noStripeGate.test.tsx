import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
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

/**
 * NEW SAVE-TIME GATE — added alongside (not instead of) the regression guard
 * above. Scoped specifically to avoid all three of the original bugs:
 *
 *   1. WRONG MOMENT — the status check only ever fires from inside Save,
 *      never on mount/open. The tests above already pin "never on mount";
 *      these pin "only when Save is actually pressed, and only when the
 *      save needs a payment account at all".
 *   2. WRONG ACCOUNT — `ownerType="personal"` hits the user-scoped endpoint,
 *      not the community one.
 *   3. FALSE POSITIVE FROM A GENERIC 403 — a 403/network failure on the
 *      status check itself must read as "can't tell", not "disconnected",
 *      and must never block the save.
 */
describe("PriceEditModal — NEW save-time Stripe gate", () => {
  const freeTiersRoute = {
    method: "GET",
    url: /\/api\/communities\/orbis\/products\/prod_1\/tiers$/,
    body: [{
      id: "tier_1",
      name: "Standard",
      priceMode: "fixed",
      salesCount: 0,
      products: { id: "ptier_1", price: 0, currency: "EUR", isRecurring: false },
    }],
  };
  const tierPutRoute = { method: "PUT", url: /\/tiers\/tier_1$/, body: {} };

  it("blocks Save on a priced tier when the community-scoped status answers disconnected", async () => {
    const fetchFn = mockFetch([
      freeTiersRoute,
      { method: "GET", url: /\/stripe\/connected$/, body: { connected: false } },
    ]);
    const onSaved = vi.fn();
    renderWithConfig(<PriceEditModal {...baseProps({ onSaved })} />);

    await screen.findByRole("button", { name: /Standard/ });
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    const priceInput = await screen.findByPlaceholderText("0.00");
    fireEvent.change(priceInput, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Connect Stripe/i)).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
    // The status check happened — but only once Save was pressed, after the
    // tiers GET, never before.
    const statusCallIndex = fetchFn.mock.calls.findIndex((c) => /\/stripe\/connected$/.test(String(c[0])));
    expect(statusCallIndex).toBeGreaterThan(-1);
  });

  it("never checks Stripe at all when the save doesn't touch a priced tier or donation", async () => {
    const fetchFn = mockFetch([
      freeTiersRoute,
      { method: "PUT", url: /\/tiers\/tier_1$/, body: {} },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps({ product: { ...paidProduct, price: 0 } })} />);

    await screen.findByRole("button", { name: /Standard/ });
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    // Rename only — still free, nothing that needs a payment account.
    const nameInput = await screen.findByDisplayValue("Standard");
    fireEvent.change(nameInput, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /stripe/i.test(u))).toBe(false);
  });

  it("ownerType=\"personal\" checks the USER-scoped endpoint, not the community one", async () => {
    const fetchFn = mockFetch([
      freeTiersRoute,
      { method: "GET", url: /\/api\/users\/me\/stripe\/status$/, body: { connected: true } },
      tierPutRoute,
      { method: "PUT", url: /\/donations$/, body: {} },
    ]);
    const onSaved = vi.fn();
    renderWithConfig(<PriceEditModal {...baseProps({ onSaved, ownerType: "personal" })} />);

    await screen.findByRole("button", { name: /Standard/ });
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    const priceInput = await screen.findByPlaceholderText("0.00");
    fireEvent.change(priceInput, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /\/api\/users\/me\/stripe\/status$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/api\/communities\/.+\/stripe\/connected$/.test(u))).toBe(false);
  });

  it("a generic 403 on the status check reads as 'can't tell', never as disconnected — Save proceeds", async () => {
    const fetchFn = mockFetch([
      freeTiersRoute,
      { method: "GET", url: /\/stripe\/connected$/, status: 403, body: { error: "Forbidden" } },
      tierPutRoute,
      { method: "PUT", url: /\/donations$/, body: {} },
    ]);
    const onSaved = vi.fn();
    renderWithConfig(<PriceEditModal {...baseProps({ onSaved })} />);

    await screen.findByRole("button", { name: /Standard/ });
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    const priceInput = await screen.findByPlaceholderText("0.00");
    fireEvent.change(priceInput, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText(/Connect Stripe/i)).toBeNull();
    void fetchFn;
  });

  it("surfaces the backend's STRIPE_NOT_CONNECTED error code from a failed write with a clear message, not the generic one", async () => {
    const fetchFn = mockFetch([
      freeTiersRoute,
      { method: "GET", url: /\/stripe\/connected$/, body: { connected: true } },
      {
        method: "PUT",
        url: /\/tiers\/tier_1$/,
        status: 403,
        bodyFn: () => ({ code: "STRIPE_NOT_CONNECTED", ownerType: "PERSONAL", ownerId: "user_1" }),
      },
    ]);
    const onSaved = vi.fn();
    renderWithConfig(<PriceEditModal {...baseProps({ onSaved })} />);

    await screen.findByRole("button", { name: /Standard/ });
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    const priceInput = await screen.findByPlaceholderText("0.00");
    fireEvent.change(priceInput, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Connect Stripe to receive payment/i)).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
    void fetchFn;
  });
});
