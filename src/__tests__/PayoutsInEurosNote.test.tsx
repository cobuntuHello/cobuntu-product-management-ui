import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { PayoutsInEurosNote } from "../components/PayoutsInEurosNote";

/**
 * Where a seller picks a currency other than the euro, one line says how such
 * a sale is paid (multi-currency MC3c, decision MC-D3: "understandable and not
 * hidden"; Terms of Service 12.1). Nothing under the euro.
 */
describe("PayoutsInEurosNote", () => {
  it("says a sale in pounds is paid out in euros at Stripe's rate", () => {
    render(<PayoutsInEurosNote currency="GBP" />);
    expect(screen.getByTestId("payouts-in-euros-note").textContent).toBe(
      "Paid out in euros at Stripe’s rate on the day of each sale.",
    );
  });

  it("says nothing under the euro, whatever its case, or with no currency yet", () => {
    const { container, rerender } = render(<PayoutsInEurosNote currency="EUR" />);
    expect(container.innerHTML).toBe("");
    rerender(<PayoutsInEurosNote currency="eur" />);
    expect(container.innerHTML).toBe("");
    rerender(<PayoutsInEurosNote currency={null} />);
    expect(container.innerHTML).toBe("");
  });
});
