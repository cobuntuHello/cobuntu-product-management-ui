/**
 * Shared types for the PriceEditModal redesign — marketplace product
 * variant. Mirrors the events package's types.ts with product-specific
 * deltas:
 *   - Tier shape carries products.isRecurring + recurringInterval
 *     (events don't recur — Stripe mode='payment').
 *   - 4-field installment plan instead of 3 — adds accessDurationMonths.
 *   - No description field on tiers (events have one).
 *   - No sourceTierId/sourceTierName on DraftTier — duplicate is
 *     server-side via the copyFromTierId backend route.
 */

export interface Tier {
  id: string;
  name: string;
  capacity: number | null;
  /** Non-refunded sales for this tier (backend joins via product_snapshots). */
  salesCount?: number;
  priceMode?: "fixed" | "pwyw" | null;
  pwywMinAmount?: number | null;
  products: {
    id: string;
    price: number;
    currency: string;
    isRecurring: boolean;
    recurringInterval: string | null;
    /** Four-or-none installment plan. Marketplace tiers persist all four;
     *  events skip accessDurationMonths (event date bounds access). */
    installmentTotalPrice?: number | null;
    installmentCount?: number | null;
    installmentIntervalMonths?: number | null;
    accessDurationMonths?: number | null;
  };
}

export interface DraftTier {
  /** Stable client-side key for DnD + react reconciliation. Survives
   *  reorder (whereas `id` only exists once persisted). */
  localId: string;
  /** Existing tier id; undefined for unsaved drafts. */
  id?: string;
  name: string;
  price: string;
  currency: string;
  capacity: string;
  isRecurring: boolean;
  recurringInterval: string;
  priceMode: "fixed" | "pwyw";
  pwywMin: string;
  /** Non-refunded sales count. > 0 → price/currency/priceMode locked. */
  salesCount: number;
  /** Installment plan: four-or-none. Enabled iff all four numeric values
   *  are non-empty valid numbers. Display-unit (e.g. "300", "3", "1",
   *  "12"); converted on save. */
  installmentEnabled: boolean;
  installmentTotal: string;          // display unit (e.g. "300" = €300 total)
  installmentCount: string;          // integer (e.g. "3" = 3 charges)
  installmentInterval: string;       // integer (e.g. "1" = monthly)
  installmentAccessMonths: string;   // integer (e.g. "12" = 12 months of access)
  /** Per-tier registration form metadata. */
  hasForm: boolean;
  formFieldCount: number;
  deleted?: boolean;
}

/** Sidecar donation config — saved separately from tiers via PUT
 *  /products/:id/donations. Mirrors events.donationConfig. */
export interface DonationDraft {
  enabled: boolean;
  mode: "fixed" | "pwyw";
  amounts: string[];
  minAmount: string;
  currency: string;
  label: string;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: ReadonlyArray<SupportedCurrency> = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
];

/** Backwards-compatible alias for the publicly-exported CURRENCIES
 *  constant on the original PriceEditModal.tsx surface. Some consumers
 *  (the admin app's tier-details page) import this directly. */
export const CURRENCIES = SUPPORTED_CURRENCIES;
