/**
 * Member-pricing data layer for the PriceEditModal redesign —
 * marketplace product variant.
 *
 * Lifts the row state + API integration out of MemberPricingSection
 * (which used to own them via useState + useImperativeHandle) up to
 * PriceEditModal. Mirrors the events package's member-pricing.ts with
 * the product-specific recurringScope field (ALWAYS vs FIRST_ONLY)
 * carried on each row.
 *
 * Why lift state up: the section's lifetime tracked the tier card's
 * expand/collapse state (it was rendered inside <Collapse>), so
 * collapsing a tier unmounted the section and dropped any dirty
 * rows. Lifting the state up means the rows survive collapse/expand
 * cycles and across hub↔step transitions — tied to the modal's
 * lifetime instead.
 */

import { fromSmallestUnit, toSmallestUnit } from "./helpers";

export type MemberPricingMode = "FREE" | "PERCENT_OFF" | "FLAT_OFF" | "FIXED_PRICE";
export type RecurringScope = "ALWAYS" | "FIRST_ONLY";

export interface CommunitySegment {
  id: string;
  name: string;
  color?: string | null;
}

export interface MemberPricingRow {
  id?: string;
  segmentId: string;
  segmentName: string;
  enabled: boolean;
  mode: MemberPricingMode;
  /** Display string. Mode-dependent: FREE ignores it, PERCENT_OFF is
   *  1–100, FLAT_OFF / FIXED_PRICE are display-unit (e.g. "10" = €10). */
  value: string;
  priority: string;
  /** Product-only delta vs events: subscription tiers can scope the
   *  discount to renewals (ALWAYS) vs the first invoice only
   *  (FIRST_ONLY). Hidden in the UI for non-recurring tiers. */
  recurringScope: RecurringScope;
  initial?: {
    enabled: boolean;
    mode: MemberPricingMode;
    value: string;
    priority: string;
    recurringScope: RecurringScope;
    id?: string;
  };
}

export type MemberPricingTierState =
  | { loading: true; error: null; rows: never[] }
  | { loading: false; error: string; rows: never[] }
  | { loading: false; error: null; rows: MemberPricingRow[] };

export function buildRowsFromOverrides(
  segments: CommunitySegment[],
  overrides: Array<Record<string, any>>,
  currencyCode: string,
): MemberPricingRow[] {
  const byId = new Map<string, any>(overrides.map((o) => [o.segmentId, o]));
  return segments.map((s) => {
    const o = byId.get(s.id);
    const valueRaw: string = o
      ? o.mode === "FLAT_OFF" || o.mode === "FIXED_PRICE"
        ? fromSmallestUnit(o.value, currencyCode)
        : String(o.value ?? "")
      : "";
    const initial = {
      enabled: !!o,
      mode: (o?.mode as MemberPricingMode) ?? "PERCENT_OFF",
      value: valueRaw,
      priority: String(o?.priority ?? "0"),
      recurringScope: (o?.recurringScope as RecurringScope) ?? "ALWAYS",
      id: o?.id,
    };
    return {
      id: o?.id,
      segmentId: s.id,
      segmentName: s.name,
      enabled: initial.enabled,
      mode: initial.mode,
      value: initial.value,
      priority: initial.priority,
      recurringScope: initial.recurringScope,
      initial,
    };
  });
}

export function rowIsDirty(r: MemberPricingRow): boolean {
  if (!r.initial) return r.enabled;
  return (
    r.enabled !== r.initial.enabled ||
    r.mode !== r.initial.mode ||
    r.value.trim() !== r.initial.value.trim() ||
    r.priority.trim() !== r.initial.priority.trim() ||
    r.recurringScope !== r.initial.recurringScope
  );
}

export function findFirstValidationError(rows: MemberPricingRow[]): string | null {
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.mode === "FREE") continue;
    const v = parseFloat(r.value);
    if (isNaN(v) || v < 0) {
      return `${r.segmentName}: value must be a non-negative number.`;
    }
    if (r.mode === "PERCENT_OFF" && (v < 1 || v > 100)) {
      return `${r.segmentName}: percent off must be between 1 and 100.`;
    }
  }
  return null;
}

export function resetRowsBaseline(rows: MemberPricingRow[]): MemberPricingRow[] {
  return rows.map((r) => ({
    ...r,
    initial: {
      enabled: r.enabled,
      mode: r.mode,
      value: r.value,
      priority: r.priority,
      recurringScope: r.recurringScope,
      id: r.id ?? r.initial?.id,
    },
  }));
}

/** Builds the upsert body. Product-specific: includes recurringScope
 *  on the payload only when the parent tier is recurring; backend
 *  ignores the field for non-recurring tiers but sending it on every
 *  tier would surprise debuggers reading the wire. */
export function buildUpsertBody(
  r: MemberPricingRow,
  currencyCode: string,
  isRecurringTier: boolean,
): Record<string, unknown> {
  let backendValue = 0;
  if (r.mode === "PERCENT_OFF") {
    backendValue = parseInt(r.value, 10);
  } else if (r.mode === "FLAT_OFF" || r.mode === "FIXED_PRICE") {
    backendValue = toSmallestUnit(parseFloat(r.value), currencyCode);
  }
  const body: Record<string, unknown> = {
    segmentId: r.segmentId,
    mode: r.mode,
    value: backendValue,
    priority: parseInt(r.priority || "0", 10) || 0,
  };
  if (isRecurringTier) {
    body.recurringScope = r.recurringScope;
  }
  return body;
}
