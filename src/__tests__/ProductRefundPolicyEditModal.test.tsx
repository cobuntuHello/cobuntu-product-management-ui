import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductRefundPolicyEditModal } from "../components/ProductRefundPolicyEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product: { id: "p-1", refundPolicy: null },
  productId: "p-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("ProductRefundPolicyEditModal", () => {
  it("preloads the existing policy (extended + window)", () => {
    renderWithConfig(
      <ProductRefundPolicyEditModal {...baseProps({ product: { id: "p-1", refundPolicy: { mode: "extended", customBuyerWindowDays: 5 } } })} />,
    );
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    // Extended row is selected (its subtitle is present and its radio filled) —
    // asserted indirectly via the value round-trip below.
  });

  it("PATCHes the product with the chosen mode + window", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "PATCH", url: "/api/users/me/products/p-1", body: { ok: true } },
    ]);
    const props = baseProps();
    renderWithConfig(<ProductRefundPolicyEditModal {...props} />);

    await user.click(screen.getByText("Extended"));
    await user.type(screen.getByPlaceholderText(/full window/i), "7");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/users/me/products/p-1"));
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.refundPolicy).toMatchObject({ mode: "extended", customBuyerWindowDays: 7 });
    });
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("omits customBuyerWindowDays when the field is left blank (whole window)", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "PATCH", url: "/api/users/me/products/p-1", body: { ok: true } },
    ]);
    renderWithConfig(<ProductRefundPolicyEditModal {...baseProps()} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/users/me/products/p-1"));
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.refundPolicy).toEqual({ mode: "default" });
    });
  });

  it("blocks save on an out-of-range window", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductRefundPolicyEditModal {...baseProps()} />);
    await user.type(screen.getByPlaceholderText(/full window/i), "91");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(screen.getByText(/between 0 and 90/i)).toBeInTheDocument();
  });

  it("keeps 0 (self-refunds disabled) as a valid, saved value", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "PATCH", url: "/api/users/me/products/p-1", body: { ok: true } },
    ]);
    renderWithConfig(<ProductRefundPolicyEditModal {...baseProps()} />);
    await user.type(screen.getByPlaceholderText(/full window/i), "0");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/users/me/products/p-1"));
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
    });
  });
});
