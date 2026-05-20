"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { SectionCard } from "@cobuntu/management-ui-shared";
import type { MemberPricingRow, MemberPricingTierState } from "./member-pricing";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { BasicsStep } from "./steps/BasicsStep";
import { OptionsStep } from "./steps/OptionsStep";
import { MembersStep } from "./steps/MembersStep";
import { FormStep } from "./steps/FormStep";

type StepId = "basics" | "options" | "members" | "form";

export interface EditHubProps {
  t: DraftTier;
  communityTag: string;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Community-only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  /** Per-tier slot from the modal-level state map. */
  memberPricingState?: MemberPricingTierState;
  /** Notify the modal of a member-pricing row change. */
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast: (msg: string) => void;
}

/**
 * The redesigned tier-edit surface for marketplace products. Renders
 * as a "hub" of four section cards (Basics / Options / Members / Form)
 * when no step is selected. Clicking a card pushes into a focused step
 * view; Back or Done returns to the hub. The outer modal's single Save
 * button commits everything.
 *
 * Mirrors @cobuntu/event-management-ui's EditHub (PR #8 slice 7
 * commit 9831819) with the mount-stability invariant baked in from
 * day one:
 *
 * MembersStep and FormStep stay mounted for the lifetime of an
 * expanded tier card — only their visibility toggles. These two own
 * state that can't be reconstructed from props:
 *   - MembersStep wraps MemberPricingSection, which holds the dirty
 *     rows + the imperative commit() handle the outer modal Save
 *     iterates. Unmounting drops the dirty rows AND removes the
 *     handle from the ref map (silent data loss on member-pricing).
 *   - FormStep auto-saves but holds the loaded fields + the per-step
 *     sub-view state. Unmounting forces another GET round-trip.
 *
 * BasicsStep and OptionsStep don't need mount stability — they read
 * everything they need from the `t: DraftTier` prop, write through
 * `onUpdate`, and have no local state to lose. Conditional rendering
 * is fine + keeps the DOM smaller while the user is on the hub.
 */
export function EditHub({
  t,
  communityTag,
  onUpdate,
  showMemberPricing,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
}: EditHubProps) {
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);

  const priceDisplay = t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free";

  const stepTitle =
    activeStep === "basics" ? "Basics" :
    activeStep === "options" ? "Options" :
    activeStep === "members" ? "Member pricing" :
    activeStep === "form" ? "Registration form" :
    null;

  // Describes the tier's billing mode in plain language for the
  // Basics card summary. Mutually exclusive triplet (one-time vs
  // recurring vs installment) keeps the summary short.
  const billingSummary =
    t.installmentEnabled ? "Installment plan" :
    t.isRecurring ? `Recurring · ${t.recurringInterval}` :
    null;

  const membersAlwaysMounted = showMemberPricing && !!t.id;
  const formAlwaysMounted = !!t.id;

  return (
    <div className="border-t border-zinc-100">
      {activeStep && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-100 bg-zinc-50/50">
          <button
            type="button"
            onClick={() => setActiveStep(null)}
            className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 cursor-pointer rounded"
            aria-label="Back to hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h4 className="text-[13px] font-semibold text-zinc-900">{stepTitle}</h4>
        </div>
      )}

      {/* Hub view */}
      <div className={activeStep ? "hidden" : "p-4 space-y-2"}>
        {locked && (
          <div className="flex items-start gap-2 px-3 py-2 -mx-1 mb-1 rounded-lg bg-amber-50/70 border border-amber-100">
            <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
            <p className="text-[12px] text-amber-700">
              <span className="font-medium">{t.salesCount} sold</span>
              {" — price, currency, and installment plan are locked. Refund all sales first to change them."}
            </p>
          </div>
        )}

        <SectionCard
          title="Basics"
          description={`${t.name || "Unnamed"} · ${priceDisplay}${billingSummary ? ` · ${billingSummary}` : ""}`}
          action={
            <button
              type="button"
              onClick={() => setActiveStep("basics")}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
            >
              Edit <ChevronRight className="w-3 h-3" />
            </button>
          }
          variant="default"
        />

        <SectionCard
          title="Options"
          description={
            [
              t.capacity ? `Cap: ${t.capacity}` : "No capacity cap",
              t.priceMode === "pwyw" ? "Pay-what-you-want" : null,
              t.installmentEnabled && t.installmentCount && t.installmentTotal
                ? `${t.installmentCount}× over ${t.installmentInterval || "1"} mo${t.installmentAccessMonths ? `, ${t.installmentAccessMonths}mo access` : ""}`
                : null,
            ].filter(Boolean).join(" · ") || "Defaults"
          }
          action={
            <button
              type="button"
              onClick={() => setActiveStep("options")}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
            >
              Edit <ChevronRight className="w-3 h-3" />
            </button>
          }
          variant="default"
        />

        {showMemberPricing && (
          <SectionCard
            title="Member pricing"
            description={t.id ? "Per-segment discount overrides for this tier." : "Save tier first to configure overrides."}
            action={
              <button
                type="button"
                onClick={() => setActiveStep("members")}
                disabled={!t.id}
                className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 disabled:text-zinc-300 disabled:cursor-not-allowed cursor-pointer"
              >
                Edit <ChevronRight className="w-3 h-3" />
              </button>
            }
            variant="default"
          />
        )}

        <SectionCard
          title="Registration form"
          description={
            !t.id
              ? "Save tier first to attach a form."
              : t.hasForm
                ? `${t.formFieldCount} field${t.formFieldCount !== 1 ? "s" : ""} linked.`
                : "No form yet."
          }
          action={
            <button
              type="button"
              onClick={() => setActiveStep("form")}
              disabled={!t.id}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 disabled:text-zinc-300 disabled:cursor-not-allowed cursor-pointer"
            >
              Edit <ChevronRight className="w-3 h-3" />
            </button>
          }
          variant="default"
        />
      </div>

      {/* Step viewport. MembersStep + FormStep mount once and stay
          mounted; their `hidden` class toggles visibility. Basics +
          Options render on-demand. */}
      <div className={activeStep ? "px-4 py-4" : "hidden"}>
        {activeStep === "basics" && <BasicsStep t={t} onUpdate={onUpdate} />}
        {activeStep === "options" && <OptionsStep t={t} onUpdate={onUpdate} />}
        {membersAlwaysMounted && (
          <div className={activeStep === "members" ? "" : "hidden"}>
            <MembersStep
              t={t}
              memberPricingState={memberPricingState}
              onMemberPricingRowChange={onMemberPricingRowChange}
              showToast={showToast}
            />
          </div>
        )}
        {formAlwaysMounted && (
          <div className={activeStep === "form" ? "" : "hidden"}>
            <FormStep t={t} communityTag={communityTag} showToast={showToast} />
          </div>
        )}
      </div>

      {activeStep && (
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-100 bg-zinc-50/50">
          <button
            type="button"
            onClick={() => setActiveStep(null)}
            className="px-3 py-1.5 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
