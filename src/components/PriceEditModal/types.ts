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
  /** Per-tier license terms (feat/tier-license-terms). Lets the same asset
   *  be sold as e.g. Personal vs Commercial, each tier carrying its own
   *  terms — shown pre/post-purchase and on the license certificate.
   *  Nullable: most tiers carry none. */
  licenseTerms?: string | null;
  /** Optional per-attachment download cap for buyers of this tier
   *  (feat/tier-max-downloads). Null = unlimited. */
  maxDownloads?: number | null;
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
/** License-terms ceiling. Matches the backend's LICENSE_TERMS_MAX (2000) in
 *  ProductTierService.normalizeLicenseTerms, which 400s past it — so the UI
 *  enforces the same maxLength + counter to keep saves from bouncing. */
export const TIER_LICENSE_TERMS_MAX = 2000;

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
  /** Per-tier license terms (feat/tier-license-terms). Plain string ("" when
   *  none) mirroring `description`; buildTierBody flips blank → null. */
  licenseTerms: string;
  /** Optional per-attachment download cap (feat/tier-max-downloads). Display
   *  string ("" = unlimited); buildTierBody parses to a positive int or null. */
  maxDownloads: string;
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
  /**
   * Draft-mode registration form, held locally until the tier exists.
   *
   * A saved tier's form lives server-side keyed on tierId, which is why a
   * tier being CREATED could not have one — no id to key on, so the modal
   * disabled the row with "Save first". The backend now accepts a form
   * inline on the create payload, so during create the builder edits this
   * instead and it ships with the tier.
   *
   * Only meaningful in draftMode. For a saved tier, hasForm/formFieldCount
   * describe the server's copy and this stays undefined.
   */
  draftForm?: { fields: any[]; stepLabels?: string[] } | null;
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
  /**
   * Variant-editor local-only draft fields (feat/product-variants-editor).
   *
   * The single-scroll variant editor surfaces shape-specific attributes the
   * backend does not yet persist at the tier level. They are held here as
   * LOCAL draft state only — buildTierBody / draftTiersToCreatePayload do NOT
   * emit them, so the save payload is byte-identical to before. A later phase
   * adds persistence. Reused, persisted fields stay where they are: Stock →
   * capacity, Licence → licenseTerms, Downloads-per-file → maxDownloads.
   *
   *   - attrs:     "Other attributes" — controlled-vocabulary key/value pairs
   *                buyers pick by (Colour, Size, …). Not freeform.
   *   - condition/parcelSize: physical-shape core selects.
   *   - files/links: digital-shape deliverables (file names, external URLs).
   *
   * All optional so the many existing DraftTier construction sites (the /tiers
   * mapper, duplicateTier, tests) need no change — reads default to empty.
   */
  attrs?: { k: string; v: string }[];
  condition?: string;
  parcelSize?: string;
  files?: string[];
  links?: string[];
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

/**
 * Controlled vocabularies for the variant editor (feat/product-variants-editor).
 * These match the prototype (product-builder-app.html) exactly and drive the
 * shape-specific selects + the "Other attributes" key picker. Kept here so the
 * editor and any future persistence layer read a single source.
 */
/** Physical condition — empty string = "Not specified". */
export const VARIANT_CONDITIONS: ReadonlyArray<string> = [
  "",
  "New with tags",
  "Very good",
  "Good",
  "Satisfactory",
];
/** Parcel size — [value, label, weight hint]. */
export const VARIANT_PARCELS: ReadonlyArray<[string, string, string]> = [
  ["STANDARD", "Standard parcel", "Up to 2 kg"],
  ["HEAVY", "Large or heavy", "2–20 kg"],
];
/** "Other attributes" keys — buyers pick by these, from a defined set. */
export const VARIANT_ATTR_KEYS: ReadonlyArray<string> = [
  "Colour",
  "Size",
  "Material",
  "Style",
  "Length",
  "Format",
  "Flavour",
  "Scent",
];

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
