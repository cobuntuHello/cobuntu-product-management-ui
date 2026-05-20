import { describe, it, expect } from "vitest";
import {
  buildDonationBody,
  buildTierBody,
  fromSmallestUnit,
  getSymbol,
  isTierLocked,
  loadDonationFromProduct,
  toDisplay,
  toSmallestUnit,
  validateDonation,
  validateTier,
  blankTier,
  blankDonation,
} from "../components/PriceEditModal/helpers";

describe("PriceEditModal helpers (product) — currency conversion", () => {
  it("toSmallestUnit/toDisplay roundtrip for fractional currencies", () => {
    expect(toSmallestUnit(20, "EUR")).toBe(2000);
    expect(toDisplay(2000, "EUR")).toBe(20);
    expect(toSmallestUnit(19.99, "USD")).toBe(1999);
  });

  it("treats JPY as zero-decimal", () => {
    expect(toSmallestUnit(2000, "JPY")).toBe(2000);
    expect(toDisplay(2000, "JPY")).toBe(2000);
  });

  it("fromSmallestUnit handles null/undefined → empty string", () => {
    expect(fromSmallestUnit(null, "EUR")).toBe("");
    expect(fromSmallestUnit(undefined, "EUR")).toBe("");
    expect(fromSmallestUnit(2000, "EUR")).toBe("20");
  });

  it("getSymbol returns the currency code as fallback", () => {
    expect(getSymbol("EUR")).toBe("€");
    expect(getSymbol("XXX")).toBe("XXX");
  });
});

describe("PriceEditModal helpers (product) — validateTier", () => {
  it("rejects blank name", () => {
    expect(validateTier({ ...blankTier(), name: "  " })).toMatch(/Tier name is required/);
  });

  it("rejects blank or NaN price", () => {
    expect(validateTier({ ...blankTier(), name: "Std", price: "" })).toMatch(/Price required/);
    expect(validateTier({ ...blankTier(), name: "Std", price: "abc" })).toMatch(/Price required/);
  });

  it("accepts zero price (free tier)", () => {
    expect(validateTier({ ...blankTier(), name: "Free", price: "0" })).toBeNull();
  });

  it("rejects negative pwyw minimum", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "PWYW",
        price: "10",
        priceMode: "pwyw",
        pwywMin: "-5",
      }),
    ).toMatch(/non-negative/);
  });

  describe("4-field installment plan (product-specific)", () => {
    const baseInstallment = {
      ...blankTier(),
      name: "Std",
      price: "100",
      installmentEnabled: true,
      installmentTotal: "300",
      installmentCount: "3",
      installmentInterval: "1",
      installmentAccessMonths: "12",
    };

    it("accepts a fully valid 4-field installment plan", () => {
      expect(validateTier(baseInstallment)).toBeNull();
    });

    it("enforces total > 0", () => {
      expect(
        validateTier({ ...baseInstallment, installmentTotal: "0" }),
      ).toMatch(/positive number/);
    });

    it("enforces count >= 2", () => {
      expect(
        validateTier({ ...baseInstallment, installmentCount: "1" }),
      ).toMatch(/at least 2/);
    });

    it("enforces interval >= 1", () => {
      expect(
        validateTier({ ...baseInstallment, installmentInterval: "0" }),
      ).toMatch(/at least 1 month/);
    });

    it("enforces access duration >= 1 (product-specific 4th field)", () => {
      expect(
        validateTier({ ...baseInstallment, installmentAccessMonths: "0" }),
      ).toMatch(/Access duration/);
      expect(
        validateTier({ ...baseInstallment, installmentAccessMonths: "" }),
      ).toMatch(/Access duration/);
    });
  });
});

describe("PriceEditModal helpers (product) — validateDonation", () => {
  it("returns null when donation is disabled", () => {
    expect(validateDonation(blankDonation())).toBeNull();
  });

  it("rejects blank entries in fixed mode", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        amounts: ["5", "", "25"],
      }),
    ).toMatch(/blank/);
  });

  it("rejects non-positive amounts in fixed mode", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        amounts: ["5", "-3", "25"],
      }),
    ).toMatch(/positive number/);
  });

  it("rejects negative pwyw minimum", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        mode: "pwyw",
        minAmount: "-1",
      }),
    ).toMatch(/non-negative/);
  });
});

describe("PriceEditModal helpers (product) — loadDonationFromProduct", () => {
  it("returns blank when donationConfig is missing", () => {
    expect(loadDonationFromProduct({ currency: "USD" })).toMatchObject({
      enabled: false,
      currency: "USD",
      amounts: ["5", "10", "25"],
    });
  });

  it("converts smallest-unit amounts to display unit", () => {
    const d = loadDonationFromProduct({
      donationConfig: {
        enabled: true,
        mode: "fixed",
        amounts: [500, 1000, 2500],
        currency: "EUR",
      },
    });
    expect(d.amounts).toEqual(["5", "10", "25"]);
    expect(d.enabled).toBe(true);
  });
});

describe("PriceEditModal helpers (product) — buildTierBody", () => {
  it("includes isRecurring + recurringInterval when isRecurring=true", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Sub",
      price: "9.99",
      isRecurring: true,
      recurringInterval: "monthly",
    });
    expect(body).toMatchObject({
      isRecurring: true,
      recurringInterval: "monthly",
    });
  });

  it("sets recurringInterval to null on one-time tiers", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "One-time",
      price: "10",
      isRecurring: false,
      recurringInterval: "monthly", // ignored when isRecurring=false
    });
    expect(body).toMatchObject({
      isRecurring: false,
      recurringInterval: null,
    });
  });

  it("serializes the 4-field installment plan in smallest units", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "100",
      currency: "EUR",
      installmentEnabled: true,
      installmentTotal: "300",
      installmentCount: "3",
      installmentInterval: "1",
      installmentAccessMonths: "12",
    });
    expect(body).toMatchObject({
      installmentTotalPrice: 30000,
      installmentCount: 3,
      installmentIntervalMonths: 1,
      accessDurationMonths: 12,
    });
  });

  it("nulls all 4 installment fields when disabled", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "100",
      installmentEnabled: false,
    });
    expect(body).toMatchObject({
      installmentTotalPrice: null,
      installmentCount: null,
      installmentIntervalMonths: null,
      accessDurationMonths: null,
    });
  });

  it("trims tier name", () => {
    expect(buildTierBody({ ...blankTier(), name: "  Std  ", price: "10" }))
      .toMatchObject({ name: "Std" });
  });
});

describe("PriceEditModal helpers (product) — buildDonationBody", () => {
  it("returns null when donation is disabled", () => {
    expect(buildDonationBody(blankDonation(), "EUR")).toBeNull();
  });

  it("serializes fixed amounts in smallest units, filtering invalids", () => {
    const body = buildDonationBody(
      {
        ...blankDonation(),
        enabled: true,
        amounts: ["5", "abc", "0", "25"],
        currency: "EUR",
      },
      "EUR",
    );
    expect(body).toMatchObject({
      enabled: true,
      mode: "fixed",
      amounts: [500, 2500],
    });
  });

  it("serializes pwyw minimum in smallest units", () => {
    const body = buildDonationBody(
      {
        ...blankDonation(),
        enabled: true,
        mode: "pwyw",
        minAmount: "5",
        currency: "EUR",
      },
      "EUR",
    );
    expect(body).toMatchObject({ mode: "pwyw", minAmount: 500 });
  });
});

describe("PriceEditModal helpers (product) — isTierLocked", () => {
  it("locked iff salesCount > 0 (product semantics)", () => {
    // Product semantics differ from events: the lock check is purely
    // salesCount-driven (events also require a `t.id` since the inline
    // check is `!!t.id && t.salesCount > 0`). Marketplace's pre-redesign
    // inline check was just `(t.salesCount || 0) > 0`; preserved here.
    expect(isTierLocked({ ...blankTier(), salesCount: 0 })).toBe(false);
    expect(isTierLocked({ ...blankTier(), salesCount: 1 })).toBe(true);
    expect(isTierLocked({ ...blankTier(), id: "t1", salesCount: 0 })).toBe(false);
    expect(isTierLocked({ ...blankTier(), id: "t1", salesCount: 1 })).toBe(true);
  });
});

describe("PriceEditModal helpers (product) — blank builders", () => {
  it("blankTier picks 'Standard' for the first tier", () => {
    expect(blankTier({ indexHint: 1 }).name).toBe("Standard");
    expect(blankTier({ indexHint: 2 }).name).toBe("Tier 2");
  });

  it("blankTier defaults to one-time + fixed + monthly interval", () => {
    const t = blankTier();
    expect(t.isRecurring).toBe(false);
    expect(t.recurringInterval).toBe("monthly");
    expect(t.priceMode).toBe("fixed");
    expect(t.installmentEnabled).toBe(false);
    expect(t.installmentAccessMonths).toBe("");
  });

  it("blankDonation defaults to a 5/10/25 suggested ladder", () => {
    expect(blankDonation().amounts).toEqual(["5", "10", "25"]);
  });
});
