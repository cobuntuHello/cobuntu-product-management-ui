import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { VatSection, vatOnNetMinor, vatRateFor } from "../components/PriceEditModal/VatSection";
import { blankTier, buildTierBody } from "../components/PriceEditModal/helpers";
import type { DraftTier, VatOptions } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

/**
 * Seller VAT on products and courses (backend docs/features/seller-vat.md).
 * The price is always before VAT; the editor only picks the rate and says what
 * buyers pay at checkout. Products follow the EU small-seller rule.
 */
const PT: VatOptions = {
  available: true,
  reason: null,
  reasonText: null,
  jurisdiction: { key: "PT", name: "Portugal", label: "IVA" },
  options: [
    { category: "STANDARD", rate: 23 },
    { category: "INTERMEDIATE", rate: 13 },
    { category: "REDUCED", rate: 6 },
    { category: "EXEMPT", rate: 0 },
  ],
};

const tier = (patch: Partial<DraftTier> = {}): DraftTier => ({ ...blankTier({ currency: "EUR" }), id: "t1", price: "20", ...patch });

function Harness({ initial, options, onChange }: { initial: DraftTier; options: VatOptions | null | undefined; onChange?: (t: DraftTier) => void }) {
  const [t, setT] = useState(initial);
  return (
    <VatSection
      t={t}
      options={options}
      locked={false}
      onUpdate={(p) => setT((prev) => { const next = { ...prev, ...p }; onChange?.(next); return next; })}
    />
  );
}

describe("VAT arithmetic", () => {
  it("adds VAT on top of the price before VAT, rounded as the backend and Stripe round it", () => {
    expect(vatOnNetMinor(2000, 23)).toBe(460);
    expect(vatOnNetMinor(150, 23)).toBe(35);
    expect(vatOnNetMinor(2000, 0)).toBe(0);
  });

  it("finds a rate only when VAT is available", () => {
    expect(vatRateFor(PT, "REDUCED")).toBe(6);
    expect(vatRateFor({ ...PT, available: false }, "REDUCED")).toBeNull();
    expect(vatRateFor(PT, null)).toBeNull();
  });
});

describe("buildTierBody and VAT", () => {
  it("sends the typed price and a new VAT setting", () => {
    expect(buildTierBody(tier({ vatCategory: "STANDARD", originalVatCategory: null }))).toMatchObject({ price: 20, vatCategory: "STANDARD" });
  });

  it("leaves VAT out when it did not change, so an unrelated edit is never refused", () => {
    expect(buildTierBody(tier({ vatCategory: "STANDARD", originalVatCategory: "STANDARD" }))).not.toHaveProperty("vatCategory");
    expect(buildTierBody(tier())).not.toHaveProperty("vatCategory");
  });

  it("clears VAT explicitly", () => {
    expect(buildTierBody(tier({ vatCategory: null, originalVatCategory: "STANDARD" }))).toMatchObject({ vatCategory: null });
  });
});

describe("VatSection", () => {
  it("offers the rates, keeps the typed price, and previews checkout", async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    renderWithConfig(<Harness initial={tier()} options={PT} onChange={changes} />);
    await user.click(screen.getByRole("radio", { name: /IVA 23%/ }));
    expect(screen.getByTestId("vat-preview").textContent).toMatch(/20[.,]00.*24[.,]60.*IVA 23%.*4[.,]60/);
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ vatCategory: "STANDARD", price: "20" }));
  });

  it("explains why VAT is not available, instead of offering a rate", () => {
    renderWithConfig(
      <Harness
        initial={tier()}
        options={{ available: false, reason: "SELLER_THRESHOLD_UNCONFIRMED", reasonText: "Confirm in your VAT details that your sales to consumers in other EU countries are under EUR 10,000 a year.", jurisdiction: null, options: [] }}
      />,
    );
    expect(screen.getByTestId("vat-unavailable").textContent).toMatch(/EUR 10,000/);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("renders nothing while loading, or where VAT is not offered", () => {
    const { container: a } = renderWithConfig(<Harness initial={tier()} options={undefined} />);
    expect(a.textContent).toBe("");
    const { container: b } = renderWithConfig(<Harness initial={tier()} options={null} />);
    expect(b.textContent).toBe("");
  });

  it("says a buyer-chosen amount is before VAT too", async () => {
    const user = userEvent.setup();
    renderWithConfig(<Harness initial={tier({ priceMode: "pwyw" })} options={PT} />);
    await user.click(screen.getByRole("radio", { name: /IVA 23%/ }));
    expect(screen.getByText(/amount before VAT/)).toBeInTheDocument();
  });
});
