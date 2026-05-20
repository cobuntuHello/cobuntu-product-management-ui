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
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await waitFor(() => expect(screen.getByDisplayValue("Standard")).toBeInTheDocument());
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("when tiers exist: renders them from the API", async () => {
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

    await waitFor(() => expect(screen.getByDisplayValue("Pro")).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByDisplayValue("Pro")).toBeInTheDocument());
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

    const input = await screen.findByDisplayValue("Pro");
    await user.clear(input);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Tier name is required"));
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("tier with salesCount > 0: shows 'X sold' badge + disables price input", async () => {
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

    await waitFor(() => expect(screen.getByText(/7 sold/i)).toBeInTheDocument());
    // Price input is disabled. Both price (50) and capacity (50) share the
    // display value "50"; grab the price one via its placeholder "0.00".
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

    await waitFor(() => expect(screen.getByDisplayValue("Pro")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /duplicate tier/i }));

    await waitFor(() => expect(screen.getByDisplayValue("Pro (copy)")).toBeInTheDocument());

    const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toEqual({ copyFromTierId: "t-1" });
  });

  it("unsaved tier: Duplicate button is NOT rendered (it'd 404 — no backend id yet)", async () => {
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await waitFor(() => expect(screen.getByDisplayValue("Standard")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /duplicate tier/i })).not.toBeInTheDocument();
  });
});
