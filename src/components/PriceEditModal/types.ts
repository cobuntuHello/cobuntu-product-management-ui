/**
 * Shared types for the PriceEditModal redesign — marketplace product
 * variant. Tracks the events package's types.ts (latest publish +
 * auto-schedule redesign) with product-specific deltas:
 *   - Tier shape carries products.isRecurring + recurringInterval
 *     (events don't recur — Stripe mode='payment').
 *   - 4-field installment plan instead of 3 — adds accessDurationMonths
 *     (events bound access by event date, so they omit it).
 *   - DraftTier adds isRecurring / recurringInterval /
 *     installmentAccessMonths alongside the event publish/schedule fields.
 */

/** Backend tier shape returned by GET /tiers. Installment fields are
 *  four-or-none for products: all four null = no plan, all four set =
 *  plan active. accessDurationMonths bounds how long a buyer keeps
 *  access after the final installment charge. */
export interface Tier {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  /** Non-refunded sales for this tier (backend joins via product_snapshots). */
  salesCount?: number;
  priceMode?: "fixed" | "pwyw" | null;
  pwywMinAmount?: number | null;
  /** Publish + auto-schedule (feat/event-tier-publish-and-schedule).
   *  All four are nullable at the schema level; null publishedAt = draft. */
  publishedAt?: string | null;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  autoScheduleEnabled?: boolean;
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

/**
 * Character limits for a tier's name + description. The backend columns
 * are unbounded `text` and the API does no length check today, so these
 * are the product-chosen ceilings the UI enforces (maxLength + counter)
 * and validateTier guards. Keep in sync if backend validation is added.
 */
export const TIER_NAME_MAX = 80;
export const TIER_DESCRIPTION_MAX = 200;

/** Local draft state for a single tier card. Fields are display-unit
 *  strings (e.g. "20" for €20) so the input rows can be authored as-is
 *  without conversion. Save flips them to smallest-unit ints. */
export interface DraftTier {
  /** Stable client-side key for DnD + react reconciliation. Survives
   *  reorder (whereas `id` only exists once persisted). */
  localId: string;
  /** Existing tier id; undefined for unsaved drafts. */
  id?: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  capacity: string;
  /** Marketplace recurring billing — Stripe mode='subscription'. Events
   *  never recur, so these are product-only. */
  isRecurring: boolean;
  recurringInterval: string;
  /** Whether the saved tier already has a registration form attached. */
  hasForm: boolean;
  /** Number of fields in the linked form (0 when not linked). */
  formFieldCount: number;
  /** Non-refunded sales count. > 0 → price/currency/priceMode locked. */
  salesCount: number;
  /** 'fixed' = listed price is the price. 'pwyw' = listed price is
   *  ignored at checkout; buyer chooses an amount above pwywMin. */
  priceMode: "fixed" | "pwyw";
  /** Display-unit minimum for pwyw mode. */
  pwywMin: string;
  /** Installment plan: four-or-none. Enabled iff all four numeric values
   *  are non-empty valid numbers. Backend enforces four-or-none. */
  installmentEnabled: boolean;
  /** Display-unit total (e.g. "300" = €300 total). */
  installmentTotal: string;
  /** Integer string (e.g. "3" = 3 charges). */
  installmentCount: string;
  /** Integer string (e.g. "1" = monthly). */
  installmentInterval: string;
  /** Integer string (e.g. "12" = 12 months of access). Product-only —
   *  events bound access by the event date instead. */
  installmentAccessMonths: string;
  expanded: boolean;
  deleted?: boolean;
  /** When this draft was created via "Duplicate", the source's tier
   *  id. The POST body sends it as copyFormFromTierId so the backend
   *  clones the source's registration form onto the new tier in the
   *  same transaction. */
  sourceTierId?: string;
  sourceTierName?: string;
  /** Publish + auto-schedule draft state. publishedAt is the single
   *  source of truth: ISO 8601 string when published, null when draft.
   *  The UI toggle reads `!!publishedAt`; flipping off clears it,
   *  flipping back on stamps `new Date().toISOString()`.
   *  `autoScheduleEnabled` gates the start/end date pickers — the gate
   *  is metadata, not a publish-state determinant.
   *  salesStartAt / salesEndAt: ISO strings or "" when unset. */
  publishedAt: string | null;
  autoScheduleEnabled: boolean;
  salesStartAt: string;
  salesEndAt: string;
}

/** Sidecar donation config — saved separately from tiers via PUT
 *  /products/:id/donations. Mirrors events.donationConfig. */
export interface DonationDraft {
  enabled: boolean;
  mode: "fixed" | "pwyw";
  /** Display-unit amounts (e.g. "5", "10", "25" for euros). */
  amounts: string[];
  /** Display-unit floor for pwyw mode. */
  minAmount: string;
  currency: string;
  label: string;
}

/** Snapshot of an existing tier captured at load time. Used to decide
 *  whether the host changed something buyers should be notified
 *  about (name or price). New tiers and changes to non-material fields
 *  like description or capacity don't enter this map. */
export interface OriginalTierSnapshot {
  name: string;
  price: string;
  currency: string;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
  /** Country/region flag emoji shown in the currency dropdown. */
  flag: string;
}

export const SUPPORTED_CURRENCIES: ReadonlyArray<SupportedCurrency> = [
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", symbol: "$", flag: "🇦🇺" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
];

/** Backwards-compatible alias for the publicly-exported CURRENCIES
 *  constant on the original PriceEditModal.tsx surface. Some consumers
 *  (the admin app's tier-details page) import this directly. */
export const CURRENCIES = SUPPORTED_CURRENCIES;
