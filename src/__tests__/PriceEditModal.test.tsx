import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * PriceEditModal — the redesigned single-scroll variant editor
 * (feat/product-variants-editor).
 *
 * The old three-level flow (list → per-tier hub → focused step) collapsed to
 * two: the variant LIST, and ONE scrolling editor per variant. So tapping a
 * variant row now lands directly on name / description / pricing / advanced —
 * there is no "Pricing configuration" or "Details" tile to click through.
 */

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
  it("when no tiers exist: pre-fills a Standard variant with the parent product price", async () => {
    const user = userEvent.setup();
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1: pre-filled Standard variant visible as a row.
    const row = await screen.findByRole("button", { name: /Standard/ });
    // Click row → single-scroll editor. Price is inline (no tile to open).
    await user.click(row);
    // price prefilled from product.price (2500 → 25).
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

    // L1 → row → single-scroll editor; price input is inline.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
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

    // Wait for L1 row, then save without entering the editor — Save is on the modal footer.
    await screen.findByRole("button", { name: /Pro/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.showToast).toHaveBeenCalledWith("Pricing updated");

    const putCalls = fetchMock.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(putCalls).toHaveLength(1);
    const putBody = JSON.parse((putCalls[0][1] as RequestInit).body as string);
    expect(putBody).toMatchObject({ name: "Pro", price: 50, currency: "EUR" });
  });

  it("on validation failure (blank variant name): toasts the error, does NOT call onSaved", async () => {
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

    // L1 → click row → editor. Name lives at the top of the scroll.
    await user.click(await screen.findByRole("button", { name: /Pro/ }));
    const input = (await screen.findByPlaceholderText(
      "e.g. Blue / M — or Personal",
    )) as HTMLInputElement;
    await user.clear(input);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Tier name is required"));
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("variant with salesCount > 0: shows 'X sold' badge + disables price input", async () => {
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
    // L1 → click row → editor. Price is inline and locked.
    await user.click(screen.getByRole("button", { name: /Pro/ }));
    const priceInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(priceInput.value).toBe("50");
    expect(priceInput.disabled).toBe(true);
  });

  it("physical product: the editor's shape core shows Condition / Parcel size / Stock", async () => {
    const user = userEvent.setup();
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps({ productType: "PHYSICAL" })} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));

    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("Parcel size")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    // Digital-only deliverables must NOT appear on a physical product.
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
    expect(screen.queryByText("External links")).not.toBeInTheDocument();
  });

  it("digital product: the editor's shape core shows Files / External links / Licence", async () => {
    const user = userEvent.setup();
    mockFetch([
      { method: "GET", url: "/products/p-1/tiers", body: [] },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps({ productType: "DIGITAL" })} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));

    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("External links")).toBeInTheDocument();
    expect(screen.getByText("Licence")).toBeInTheDocument();
    // Physical-only fields must NOT appear on a digital product.
    expect(screen.queryByText("Condition")).not.toBeInTheDocument();
    expect(screen.queryByText("Parcel size")).not.toBeInTheDocument();
  });

  it("footer: Delete is hidden for the only variant, shown once more than one exists", async () => {
    const user = userEvent.setup();
    mockFetch([
      {
        method: "GET", url: "/products/p-1/tiers", body: [
          {
            id: "t-1", name: "Solo", capacity: null, priceMode: "fixed", pwywMinAmount: null,
            products: { id: "tp-1", price: 5000, currency: "EUR", isRecurring: false, recurringInterval: null },
          },
        ],
      },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // Only variant → editor footer is two equal buttons: Cancel + Save, no Delete.
    await user.click(await screen.findByRole("button", { name: /Solo/ }));
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();

    // Add a second variant → its editor opens with Delete available.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await user.click(await screen.findByRole("button", { name: /Add variant/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument(),
    );
  });
});
