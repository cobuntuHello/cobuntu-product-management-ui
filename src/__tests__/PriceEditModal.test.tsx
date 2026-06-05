import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const product = {
  id: "p-1",
  name: "Cool product",
  price: 2500,
  currency: "EUR",
  isRecurring: false,
  recurringInterval: "monthly",
  donationConfig: null,
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product,
  communityTag: "orbis",
  productId: "p-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("PriceEditModal", () => {
  it("when no tiers exist: pre-fills a Standard tier with the parent product price", async () => {
    const user = userEvent.setup();
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1: pre-filled Standard tier visible as a row.
    const row = await screen.findByRole("button", { name: /Standard/ });
    // Click row → L2 hub.
    await user.click(row);
    // L2 → click Pricing configuration tile → L3 where price lives.
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));
    // BasicsStep mounted; price prefilled from product.price (2500 → 25).
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("when tiers exist: renders them from the API", async () => {
    const user = userEvent.setup();
    mockFetch([
      {
        method: "GET", url: "/products/p-1/tiers", body: [
          {
            id: "t-1",
            name: "Pro",
            capacity: 10,
            priceMode: "fixed",
            pwywMinAmount: null,
            products: { id: "tp-1", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
          },
        ],
      },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 → row → L2 → Pricing configuration → L3 for the price input.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });

  it("on Save: PUTs each existing tier and toasts success", async () => {
    const fetchMock = mockFetch([
      {
        method: "GET", url: "/products/p-1/tiers", body: [
          {
            id: "t-1", name: "Pro", capacity: null, priceMode: "fixed", pwywMinAmount: null,
            products: { id: "tp-1", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
          },
        ],
      },
      { method: "PUT", url: "/products/p-1/tiers/t-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<PriceEditModal {...props} />);

    // Wait for L1 row, then save without entering the hub — Save is on the modal footer.
    await screen.findByRole("button", { name: /Pro/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.showToast).toHaveBeenCalledWith("Pricing updated");

    const putCalls = fetchMock.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(putCalls).toHaveLength(1);
    const putBody = JSON.parse((putCalls[0][1] as RequestInit).body as string);
    expect(putBody).toMatchObject({ name: "Pro", price: 50, currency: "EUR" });
  });

  it("on validation failure (blank tier name): toasts the error, does NOT call onSaved", async () => {
    mockFetch([
      {
        method: "GET", url: "/products/p-1/tiers", body: [
          {
            id: "t-1", name: "Pro", capacity: null, priceMode: "fixed", pwywMinAmount: null,
            products: { id: "tp-1", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<PriceEditModal {...props} />);

    // L1 → click tier row → L2 → open Details (name lives there now).
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
    await user.click(await screen.findByRole("button", { name: /Details/ }));
    const input = (await screen.findByPlaceholderText(
      "Standard, VIP, Early-bird…",
    )) as HTMLInputElement;
    await user.clear(input);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Tier name is required"));
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("tier with salesCount > 0: shows 'X sold' badge + disables price input", async () => {
    const user = userEvent.setup();
    mockFetch([
      {
        method: "GET", url: "/products/p-1/tiers", body: [
          {
            id: "t-1", name: "Pro", capacity: 50, priceMode: "fixed", pwywMinAmount: null,
            salesCount: 7,
            products: { id: "tp-1", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
          },
        ],
      },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 row shows the sold count as "7/50".
    await waitFor(() =>
      expect(screen.getAllByText(/7\/50/).length).toBeGreaterThanOrEqual(1),
    );
    // L1 → click row → L2 → click Pricing configuration tile → L3 where price lives.
    await user.click(screen.getByRole("button", { name: /Pro/ }));
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));
    const priceInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(priceInput.value).toBe("50");
    expect(priceInput.disabled).toBe(true);
  });

  it("Duplicate button on saved tier: POSTs copyFromTierId, appends the new tier", async () => {
    const fetchMock = mockFetch([
      {
        method: "GET", url: "/products/p-1/tiers", body: [
          {
            id: "t-1", name: "Pro", capacity: null, priceMode: "fixed", pwywMinAmount: null,
            products: { id: "tp-1", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
          },
        ],
      },
      {
        method: "POST", url: "/products/p-1/tiers", body: {
          id: "t-2", name: "Pro (copy)", capacity: null, priceMode: "fixed", pwywMinAmount: null,
          products: { id: "tp-2", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
        },
      },
    ]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // Duplicate is an L2 (per-tier hub) footer action now — enter the tier first.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
    await user.click(await screen.findByRole("button", { name: /^duplicate$/i }));

    // The POST fires immediately; wait for it before navigating back.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === "POST")).toBe(true),
    );

    // Back to L1 — both tiers (incl. the appended copy) show as rows.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Pro \(copy\)/ })).toBeInTheDocument(),
    );

    const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toEqual({ copyFromTierId: "t-1" });
  });

  it("unsaved tier: Duplicate button is NOT rendered (it'd 404 — no backend id yet)", async () => {
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1: pre-filled unsaved "Standard" row is visible. Enter it → L2 hub.
    await user.click(await screen.findByRole("button", { name: /Standard/ }));
    // Delete (always shown) confirms we're in the L2 footer; Duplicate is
    // hidden for unsaved tiers (no backend id to copy from).
    await screen.findByRole("button", { name: "Delete" });
    expect(screen.queryByRole("button", { name: /^duplicate$/i })).not.toBeInTheDocument();
  });
});
