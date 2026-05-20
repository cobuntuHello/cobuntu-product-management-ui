/**
 * Pure helpers for the PriceEditModal redesign — marketplace product
 * variant. Mirrors the events package's helpers.ts with these deltas:
 *   - validateTier enforces 4-of-none (events: 3-of-none).
 *   - buildTierBody persists isRecurring + recurringInterval +
 *     accessDurationMonths; omits notify-attendees / copyFormFromTierId
 *     / description.
 *   - blankTier seeds isRecurring + accessDuration defaults.
 *   - No findTiersWithMaterialChanges helper — products don't have the
 *     notify-attendees prompt.
 */

import {
  SUPPORTED_CURRENCIES,
  type DonationDraft,
  type DraftTier,
} from "./types";

export function getSymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol || code;
}

export function toDisplay(price: number, currency: string): number {
  return currency === "JPY" ? price : price / 100;
}

export function toSmallestUnit(majorAmount: number, currency: string): number {
  return currency === "JPY" ? Math.round(majorAmount) : Math.round(majorAmount * 100);
}

export function fromSmallestUnit(
  smallestAmount: number | null | undefined,
  currency: string,
): string {
  if (smallestAmount == null) return "";
  return String(currency === "JPY" ? smallestAmount : smallestAmount / 100);
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `local-${Math.random().toString(36).slice(2)}`;
}

export interface BlankTierSeed {
  currency?: string;
  indexHint?: number;
  isRecurring?: boolean;
  recurringInterval?: string;
}

export function blankTier(seed: BlankTierSeed = {}): DraftTier {
  const currency = seed.currency || "EUR";
  const indexHint = seed.indexHint ?? 1;
  return {
    localId: newLocalId(),
    name: indexHint === 1 ? "Standard" : `Tier ${indexHint}`,
    price: "",
    currency,
    capacity: "",
    isRecurring: !!seed.isRecurring,
    recurringInterval: seed.recurringInterval || "monthly",
    priceMode: "fixed",
    pwywMin: "",
    salesCount: 0,
    installmentEnabled: false,
    installmentTotal: "",
    installmentCount: "",
    installmentInterval: "1",
    installmentAccessMonths: "",
    hasForm: false,
    formFieldCount: 0,
  };
}

export function blankDonation(currency = "EUR"): DonationDraft {
  return {
    enabled: false,
    mode: "fixed",
    amounts: ["5", "10", "25"],
    minAmount: "",
    currency,
    label: "",
  };
}

/** Builds a DonationDraft from a product's donationConfig sidecar. */
export function loadDonationFromProduct(product: { donationConfig?: unknown; currency?: string } | null | undefined): DonationDraft {
  const cfg = product?.donationConfig as Record<string, any> | undefined;
  if (!cfg || typeof cfg !== "object") {
    return blankDonation((product?.currency || "EUR").toUpperCase());
  }
  const currency: string = cfg.currency || product?.currency || "EUR";
  const mode: "fixed" | "pwyw" = cfg.mode === "pwyw" ? "pwyw" : "fixed";
  const amounts: string[] = Array.isArray(cfg.amounts) && cfg.amounts.length > 0
    ? cfg.amounts.map((a: number) => fromSmallestUnit(a, currency))
    : ["5", "10", "25"];
  const minAmount: string = cfg.minAmount != null ? fromSmallestUnit(cfg.minAmount, currency) : "";
  return {
    enabled: !!cfg.enabled,
    mode,
    amounts,
    minAmount,
    currency,
    label: cfg.label || "",
  };
}

/** Validate one tier draft. Returns null when valid, an error message
 *  otherwise. Enforces the backend's four-of-none + lock-when-sold
 *  rules client-side so the host sees inline messages instead of a
 *  generic 400 toast. */
export function validateTier(t: DraftTier): string | null {
  if (!t.name.trim()) return "Tier name is required";
  if (t.price === "" || isNaN(parseFloat(t.price))) {
    return `Price required for "${t.name}"`;
  }
  if (t.priceMode === "pwyw" && t.pwywMin.trim()) {
    const min = parseFloat(t.pwywMin);
    if (isNaN(min) || min < 0) {
      return `Minimum amount for "${t.name}" must be a non-negative number.`;
    }
  }
  if (t.installmentEnabled) {
    const total = parseFloat(t.installmentTotal);
    const count = parseInt(t.installmentCount, 10);
    const interval = parseInt(t.installmentInterval, 10);
    const access = parseInt(t.installmentAccessMonths, 10);
    if (isNaN(total) || total <= 0) {
      return `Installment total for "${t.name}" must be a positive number.`;
    }
    if (isNaN(count) || count < 2) {
      return `Installment count for "${t.name}" must be at least 2.`;
    }
    if (isNaN(interval) || interval < 1) {
      return `Installment interval for "${t.name}" must be at least 1 month.`;
    }
    if (isNaN(access) || access < 1) {
      return `Access duration for "${t.name}" must be at least 1 month.`;
    }
  }
  return null;
}

export function validateDonation(d: DonationDraft): string | null {
  if (!d.enabled) return null;
  if (d.mode === "fixed") {
    const trimmed = d.amounts.map((a) => a.trim());
    const hasBlank = trimmed.some((a) => a === "");
    if (hasBlank) return "Fill in or remove blank donation amounts.";
    const invalid = trimmed.find((a) => {
      const n = parseFloat(a);
      return isNaN(n) || n <= 0;
    });
    if (invalid !== undefined) {
      return `Donation amount "${invalid}" must be a positive number.`;
    }
    if (trimmed.length === 0) {
      return "At least one donation amount is required when fixed mode is enabled.";
    }
  }
  if (d.mode === "pwyw" && d.minAmount.trim()) {
    const n = parseFloat(d.minAmount);
    if (isNaN(n) || n < 0) {
      return "Minimum donation must be a non-negative number.";
    }
  }
  return null;
}

/** A tier is "locked" once it has paid sales — price + currency +
 *  pricing mode + installment plan become immutable server-side.
 *  Brand-new tiers (no id) are never locked. */
export function isTierLocked(t: DraftTier): boolean {
  return (t.salesCount || 0) > 0;
}

/** Builds the per-tier POST/PUT body. Locked tiers still send their
 *  locked fields — the marketplace product backend doesn't have the
 *  events' "skip locked fields" semantics; backend rejects the write
 *  when sales exist, surfacing as the same 400 the validateTier check
 *  catches client-side. */
export function buildTierBody(t: DraftTier): Record<string, unknown> {
  const pwywMinSmallest = t.priceMode === "pwyw" && t.pwywMin.trim()
    ? toSmallestUnit(parseFloat(t.pwywMin), t.currency)
    : null;
  const installmentBody = t.installmentEnabled
    ? {
        installmentTotalPrice: toSmallestUnit(parseFloat(t.installmentTotal), t.currency),
        installmentCount: parseInt(t.installmentCount, 10),
        installmentIntervalMonths: parseInt(t.installmentInterval, 10),
        accessDurationMonths: parseInt(t.installmentAccessMonths, 10),
      }
    : {
        installmentTotalPrice: null,
        installmentCount: null,
        installmentIntervalMonths: null,
        accessDurationMonths: null,
      };
  return {
    name: t.name.trim(),
    price: parseFloat(t.price || "0"),
    currency: t.currency,
    capacity: t.capacity ? parseInt(t.capacity, 10) : null,
    isRecurring: t.isRecurring,
    recurringInterval: t.isRecurring ? t.recurringInterval : null,
    priceMode: t.priceMode,
    pwywMinAmount: pwywMinSmallest,
    ...installmentBody,
  };
}

/** Builds the donation-config sidecar body. Returns null when the
 *  draft is disabled — caller PUTs null to clear server state. */
export function buildDonationBody(
  d: DonationDraft,
  defaultCurrency: string,
): Record<string, unknown> | null {
  if (!d.enabled) return null;
  const currency = d.currency || defaultCurrency || "EUR";
  const base: Record<string, unknown> = {
    enabled: d.enabled,
    mode: d.mode,
    currency,
  };
  if (d.mode === "fixed") {
    base.amounts = d.amounts
      .map((a) => parseFloat(a))
      .filter((a) => !isNaN(a) && a > 0)
      .map((a) => toSmallestUnit(a, currency));
  } else if (d.mode === "pwyw") {
    const minRaw = d.minAmount ? parseFloat(d.minAmount) : null;
    if (minRaw != null && !isNaN(minRaw)) {
      base.minAmount = toSmallestUnit(minRaw, currency);
    }
  }
  if (d.label.trim()) base.label = d.label.trim();
  return base;
}
