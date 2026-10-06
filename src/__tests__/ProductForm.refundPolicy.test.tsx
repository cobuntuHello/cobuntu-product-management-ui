import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * The refund policy, chosen inline in the "Policies & access" (settings) step with
 * the SAME RefundPolicyField the manage modal uses (T-234). Two presets: Standard
 * (null) and No self-service refunds (customBuyerWindowDays: 0).
 */
const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };

function lastEmit(onChange: ReturnType<typeof vi.fn>) {
  const calls = onChange.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : null;
}

describe("ProductForm — refund policy", () => {
  it("shows the Refunds control on the settings page, not on commerce", () => {
    const { rerender } = renderWithConfig(<ProductForm {...base} onChange={vi.fn()} page="settings" />);
    expect(screen.getByText("Refunds")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Standard refunds/i })).toBeInTheDocument();

    rerender(<ProductForm {...base} onChange={vi.fn()} page="commerce" />);
    expect(screen.queryByText("Refunds")).not.toBeInTheDocument();
  });

  it("emits null (Standard) by default", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} page="settings" />);
    expect(lastEmit(onChange).refundPolicy).toBeNull();
  });

  it("emits customBuyerWindowDays:0 when the seller picks No self-service refunds", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} page="settings" />);
    fireEvent.click(screen.getByRole("button", { name: /No self-service refunds/i }));
    expect(lastEmit(onChange).refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
  });

  it("seeds from initialData so an untouched edit does not reset it", () => {
    const onChange = vi.fn();
    renderWithConfig(
      <ProductForm
        {...base}
        onChange={onChange}
        page="settings"
        initialData={{ refundPolicy: { mode: "default", customBuyerWindowDays: 0 } } as any}
      />,
    );
    expect(screen.getByRole("button", { name: /No self-service refunds/i })).toHaveAttribute("aria-pressed", "true");
    expect(lastEmit(onChange).refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
  });
});
