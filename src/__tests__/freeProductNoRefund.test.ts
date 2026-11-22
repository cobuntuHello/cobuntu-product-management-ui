import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { productHasPaidOffer, formVariantsHavePaid } from "../lib/paidProduct";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

/**
 * A free product (or course) has nothing to refund, so it gets no refund policy
 * control. Any variant that costs something, or is pay-what-you-want, makes it
 * paid again.
 */
describe("when a product is paid", () => {
  it("is free at price 0 with no variants", () => {
    expect(productHasPaidOffer({ price: 0 })).toBe(false);
  });
  it("is paid at a price above 0", () => {
    expect(productHasPaidOffer({ price: 1900 })).toBe(true);
  });
  it("is free when every variant is 0, paid when any costs something", () => {
    expect(productHasPaidOffer({ tiers: [{ price: 0 }, { product: { price: 0 } }] })).toBe(false);
    expect(productHasPaidOffer({ tiers: [{ price: 0 }, { price: 900 }] })).toBe(true);
  });
  it("counts pay-what-you-want as paid", () => {
    expect(productHasPaidOffer({ tiers: [{ price: 0, priceMode: "pwyw" }] })).toBe(true);
    expect(productHasPaidOffer({ price: 0, priceMode: "pwyw" })).toBe(true);
  });
  it("reads the create form's string prices and ignores deleted variants", () => {
    expect(formVariantsHavePaid([{ price: "0" }, { price: "" }])).toBe(false);
    expect(formVariantsHavePaid([{ price: "0" }, { price: "9.99" }])).toBe(true);
    expect(formVariantsHavePaid([{ price: "9.99", deleted: true }])).toBe(false);
  });
});

describe("the refund controls are gated on it", () => {
  it("the settings drawer shows the refund row only for a paid product", () => {
    expect(read("../page/ProductSettingsDrawer.tsx")).toContain("productHasPaidOffer(product) && (");
  });
  it("the form shows the refund field only when a variant can be paid", () => {
    expect(read("../components/ProductForm.tsx")).toContain("showSettings && (multiTier ? formVariantsHavePaid(tiers) : Number(price) > 0) && (");
  });
});
