import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductRefundPolicyEditModal } from "../components/ProductRefundPolicyEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The manage-page refund editor, simplified (T-234) to the two presets sellers
 * asked for — Standard vs No self-service refunds — using the SAME RefundPolicyField
 * the create wizard shows. Saves via PATCH /api/users/me/products/:id.
 */
const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product: { id: "p-1", refundPolicy: null },
  productId: "p-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

function lastPatchBody(fetchMock: ReturnType<typeof mockFetch>) {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/users/me/products/p-1"));
  expect(call).toBeTruthy();
  return JSON.parse((call![1] as RequestInit).body as string);
}

describe("ProductRefundPolicyEditModal", () => {
  it("preloads 'No self-service refunds' when the window is 0", () => {
    renderWithConfig(
      <ProductRefundPolicyEditModal {...baseProps({ product: { id: "p-1", refundPolicy: { mode: "default", customBuyerWindowDays: 0 } } })} />,
    );
    expect(screen.getByRole("button", { name: /No self-service refunds/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("defaults to Standard when there is no policy", () => {
    renderWithConfig(<ProductRefundPolicyEditModal {...baseProps()} />);
    expect(screen.getByRole("button", { name: /Standard refunds/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("PATCHes null (platform default) for Standard", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([{ method: "PATCH", url: "/api/users/me/products/p-1", body: { ok: true } }]);
    const props = baseProps({ product: { id: "p-1", refundPolicy: { mode: "default", customBuyerWindowDays: 0 } } });
    renderWithConfig(<ProductRefundPolicyEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /Standard refunds/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(lastPatchBody(fetchMock).refundPolicy).toBeNull());
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("PATCHes customBuyerWindowDays:0 for No self-service refunds", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([{ method: "PATCH", url: "/api/users/me/products/p-1", body: { ok: true } }]);
    renderWithConfig(<ProductRefundPolicyEditModal {...baseProps()} />);

    await user.click(screen.getByRole("button", { name: /No self-service refunds/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(lastPatchBody(fetchMock).refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 }),
    );
  });
});
