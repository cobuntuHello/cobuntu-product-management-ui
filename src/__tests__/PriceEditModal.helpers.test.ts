import { describe, it, expect } from "vitest";
import {
  buildDonationBody,
  buildTierBody,
  draftTiersToCreatePayload,
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
import {
  TIER_NAME_MAX,
  TIER_DESCRIPTION_MAX,
} from "../components/PriceEditModal/types";

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

  // ── Event-ported name/description length rules (TIER_NAME_MAX=80,
  //    TIER_DESCRIPTION_MAX=200). Mirrors the EVENT helpers test. ──
  it("rejects an over-long name (> TIER_NAME_MAX chars)", () => {
    expect(
      validateTier({ ...blankTier(), name: "x".repeat(TIER_NAME_MAX + 1), price: "10" }),
    ).toMatch(new RegExp(`${TIER_NAME_MAX} characters or fewer`));
  });

  it("rejects an over-long description (> TIER_DESCRIPTION_MAX chars)", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "Standard",
        price: "10",
        description: "y".repeat(TIER_DESCRIPTION_MAX + 1),
      }),
    ).toMatch(new RegExp(`${TIER_DESCRIPTION_MAX} characters or fewer`));
  });

  it("accepts name + description exactly at the limits", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "x".repeat(TIER_NAME_MAX),
        price: "10",
        description: "y".repeat(TIER_DESCRIPTION_MAX),
      }),
    ).toBeNull();
  });

  // ── Event-ported auto-schedule sales-window rules. ──
  describe("auto-schedule sales window (event-ported)", () => {
    const sched = (over: Record<string, unknown>) =>
      validateTier({
        ...blankTier(),
        name: "Std",
        price: "10",
        autoScheduleEnabled: true,
        salesStartAt: "",
        salesEndAt: "",
        ...over,
      });

    it("rejects auto-schedule enabled with no dates at all", () => {
      expect(sched({})).toMatch(/turn off auto-schedule/);
    });

    it("accepts auto-schedule with only a start date (open-ended)", () => {
      expect(sched({ salesStartAt: "2026-06-01T12:00:00.000Z" })).toBeNull();
    });

    it("accepts auto-schedule with only an end date (opens on publish)", () => {
      expect(sched({ salesEndAt: "2026-06-05T12:00:00.000Z" })).toBeNull();
    });

    it("rejects a window where close <= open", () => {
      expect(
        sched({
          salesStartAt: "2026-06-05T12:00:00.000Z",
          salesEndAt: "2026-06-01T12:00:00.000Z",
        }),
      ).toMatch(/close must be after sales open/);
    });

    it("accepts a window where close > open", () => {
      expect(
        sched({
          salesStartAt: "2026-06-01T12:00:00.000Z",
          salesEndAt: "2026-06-05T12:00:00.000Z",
        }),
      ).toBeNull();
    });

    it("ignores the window rules when auto-schedule is off", () => {
      expect(
        validateTier({
          ...blankTier(),
          name: "Std",
          price: "10",
          autoScheduleEnabled: false,
          salesStartAt: "2026-06-05T12:00:00.000Z",
          salesEndAt: "2026-06-01T12:00:00.000Z",
        }),
      ).toBeNull();
    });
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

  it("emits product keys AND the event-ported scheduling keys together", () => {
    const start = "2026-06-01T12:00:00.000Z";
    const end = "2026-06-05T12:00:00.000Z";
    const publishedAt = new Date("2026-06-01T12:00:00.000Z").toISOString();
    const body = buildTierBody({
      ...blankTier(),
      name: "Sub",
      price: "9.99",
      isRecurring: true,
      recurringInterval: "monthly",
      installmentEnabled: true,
      installmentTotal: "300",
      installmentCount: "3",
      installmentInterval: "1",
      installmentAccessMonths: "12",
      publishedAt,
      autoScheduleEnabled: true,
      salesStartAt: start,
      salesEndAt: end,
    });
    // Product-specific keys.
    expect(body).toMatchObject({
      isRecurring: true,
      recurringInterval: "monthly",
      accessDurationMonths: 12,
    });
    // Event-ported scheduling keys.
    expect(body).toMatchObject({
      publishedAt,
      autoScheduleEnabled: true,
      salesStartAt: start,
      salesEndAt: end,
    });
  });

  it("nulls the sales window when autoScheduleEnabled is off, even with dates present", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "20",
      publishedAt: new Date().toISOString(),
      autoScheduleEnabled: false,
      salesStartAt: "2026-06-01T12:00:00.000Z",
      salesEndAt: "2026-06-05T12:00:00.000Z",
    });
    expect(body).toMatchObject({
      autoScheduleEnabled: false,
      salesStartAt: null,
      salesEndAt: null,
    });
  });

  it("sends publishedAt as null for a drafted (unpublished) tier", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "20",
      publishedAt: null,
    });
    expect(body).toMatchObject({ publishedAt: null });
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
  it("locked iff the tier is saved AND has sales (product semantics)", () => {
    // Merged semantics: `!!t.id && t.salesCount > 0`. A brand-new draft
    // (no `id`) is never locked even if it carries a salesCount fixture —
    // there is nothing persisted to protect server-side yet. Lock only
    // engages once the tier exists AND has at least one non-refunded sale.
    expect(isTierLocked({ ...blankTier(), salesCount: 0 })).toBe(false);
    expect(isTierLocked({ ...blankTier(), salesCount: 1 })).toBe(false);
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

  it("blankTier seeds the event-ported publish + schedule defaults", () => {
    const t = blankTier();
    expect(t.publishedAt).toBeTruthy();
    expect(t.autoScheduleEnabled).toBe(false);
    expect(t.salesStartAt).toBe("");
    expect(t.salesEndAt).toBe("");
  });

  it("blankDonation defaults to a 5/10/25 suggested ladder", () => {
    expect(blankDonation().amounts).toEqual(["5", "10", "25"]);
  });
});

describe("draftTiersToCreatePayload", () => {
  it("maps each live draft through buildTierBody (full rich shape)", () => {
    const drafts = [
      {
        ...blankTier({ currency: "EUR" }),
        name: "General",
        price: "45",
        capacity: "120",
        priceMode: "pwyw" as const,
        pwywMin: "30",
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "3",
        installmentInterval: "1",
        installmentAccessMonths: "6",
      },
    ];
    const payload = draftTiersToCreatePayload(drafts);
    expect(payload).toHaveLength(1);
    // Carries the advanced fields the create-product API (ProductTierInput)
    // honors — installments, pwyw floor, capacity — not just name/price.
    expect(payload[0]).toMatchObject({
      name: "General",
      price: 45,
      currency: "EUR",
      capacity: 120,
      priceMode: "pwyw",
      pwywMinAmount: 3000,
      installmentTotalPrice: 30000,
      installmentCount: 3,
      installmentIntervalMonths: 1,
      accessDurationMonths: 6,
    });
    // Publish/schedule keys are present (buildTierBody always emits them).
    expect(payload[0]).toHaveProperty("publishedAt");
    expect(payload[0]).toHaveProperty("autoScheduleEnabled");
  });

  it("drops soft-deleted and blank-name drafts so a placeholder tier is never sent", () => {
    const drafts = [
      { ...blankTier({ currency: "EUR" }), name: "Keep", price: "10" },
      { ...blankTier({ currency: "EUR" }), name: "  ", price: "5" }, // blank name
      { ...blankTier({ currency: "EUR" }), name: "Gone", price: "9", deleted: true },
    ];
    const payload = draftTiersToCreatePayload(drafts);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ name: "Keep" });
  });
});

/**
 * The create payload carries a staged form; the tier POST/PUT bodies do not.
 *
 * buildTierBody serves BOTH — the create payload and the tier endpoints on a
 * saved product, where a form is managed through its own endpoint. Putting
 * `form` in buildTierBody would send dead weight on every tier update, so it
 * is added in draftTiersToCreatePayload instead. This pins that split; it is
 * the kind of thing a later "tidy up, they're nearly the same" refactor undoes.
 */
describe("draftTiersToCreatePayload — staged registration form", () => {
  it("includes form only when the draft actually has fields", () => {
    const withForm = { ...blankTier({ currency: "EUR" }), name: "Standard", price: "10", draftForm: { fields: [{ id: "a", label: "A" }] } };
    const withoutForm = { ...blankTier({ currency: "EUR" }), name: "Basic", price: "5" };
    const emptyForm = { ...blankTier({ currency: "EUR" }), name: "Empty", price: "5", draftForm: { fields: [] } };

    const payload = draftTiersToCreatePayload([withForm, withoutForm, emptyForm] as any);

    expect((payload[0] as any).form.fields).toHaveLength(1);
    // Absent, not null: an empty form would gate checkout behind no questions.
    expect((payload[1] as any).form).toBeUndefined();
    expect((payload[2] as any).form).toBeUndefined();
  });

  it("does NOT put form on the tier update body", () => {
    const t = { ...blankTier({ currency: "EUR" }), name: "Standard", price: "10", draftForm: { fields: [{ id: "a", label: "A" }] } };
    expect((buildTierBody(t as any) as any).form).toBeUndefined();
  });
});
