"use client";

import { MemberPricingSection } from "../../MemberPricingSection";
import type { DraftTier } from "../types";
import { getSymbol } from "../helpers";
import type { MemberPricingRow, MemberPricingTierState } from "../member-pricing";

export interface MembersStepProps {
  t: DraftTier;
  /** Per-tier slot from the modal-level state map. Undefined when the
   *  tier hasn't been saved yet (no id). */
  memberPricingState?: MemberPricingTierState;
  /** Notify the modal of a member-pricing row change. */
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast: (msg: string) => void;
}

/**
 * "Members" step — community-only per-segment discount overrides for
 * this marketplace product tier. Renders the presentational
 * MemberPricingSection driven by the modal-level state map (lifted
 * out of the section itself so dirty rows survive tier collapse / step
 * navigation / any unmount).
 *
 * Forwards `isRecurringTier` from the tier draft so the recurringScope
 * (ALWAYS vs FIRST_ONLY) row only renders on subscription tiers.
 *
 * Unsaved tiers (no `t.id`) skip the section.
 */
export function MembersStep({
  t,
  memberPricingState,
  onMemberPricingRowChange,
}: MembersStepProps) {
  const sym = getSymbol(t.currency);
  const tierId = t.id;

  if (!tierId || !memberPricingState) {
    return (
      <div className="px-4 py-6 rounded-lg border border-dashed border-zinc-300 text-center">
        <p className="text-[12px] font-medium text-zinc-700">Save tier first</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          Member-pricing overrides need a saved tier id. Save once, then come back here.
        </p>
      </div>
    );
  }

  return (
    <MemberPricingSection
      state={memberPricingState}
      onRowChange={(idx, patch) => onMemberPricingRowChange?.(idx, patch)}
      currencySymbol={sym}
      isRecurringTier={t.isRecurring}
    />
  );
}
