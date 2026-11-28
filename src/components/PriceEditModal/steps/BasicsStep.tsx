"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui/select";
import {
  BillingRadio,
  type BillingMode,
} from "@cobuntu/management-ui-shared";
import { SUPPORTED_CURRENCIES, type DraftTier } from "../types";
import { getSymbol, isTierLocked } from "../helpers";
import { Collapse, Eyebrow, StepInput } from "../_primitives";
import { MembersStep } from "./MembersStep";
import type { MemberPricingRow, MemberPricingTierState } from "../member-pricing";
import { PayoutsInEurosNote } from "../../PayoutsInEurosNote";

import { useProductT } from "../../../i18n/productCopy";
export interface BasicsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Member-pricing (community-only) is folded into this step so all
   *  pricing config lives in one place. Off → the section isn't rendered. */
  showMemberPricing?: boolean;
  memberPricingState?: MemberPricingTierState;
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast?: (msg: string) => void;
  /** Create flow — lets the member-pricing rows stay editable for a tier that
   *  has no server id yet (folded into the create payload on Save). */
  draftMode?: boolean;
}

/**
 * "Pricing configuration" step — the per-tier pricing surface. Field
 * order is deliberate: pricing model → price → billing mode → member
 * pricing, so the host decides HOW the tier is priced before typing the
 * amount. (Capacity + name live in the Details step.)
 *
 * Marketplace products expose all three billing modes:
 *   - ONE_TIME (one-off purchase, no recurring schedule)
 *   - RECURRING (Stripe subscription with weekly/monthly/yearly interval)
 *   - INSTALLMENT_PLAN (split-pay: total + charges + interval + access
 *     duration in months)
 *
 * Recurring and installment-plan are mutually exclusive — Stripe checkout
 * can't satisfy both subscription_data shapes in one session. Billing mode
 * is a derived view over `isRecurring` + `installmentEnabled`; flipping into
 * INSTALLMENT_PLAN turns recurring off, and vice versa. The installment
 * quartet respects the backend's four-or-none validator (count >= 2,
 * interval >= 1 month, access >= 1 month, total > 0). Price/currency/mode
 * lock once a tier has sales.
 */
export function BasicsStep({
  t,
  onUpdate,
  showMemberPricing = false,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
  draftMode,
}: BasicsStepProps) {
  const tp = useProductT("marketplaceUi.productUi");
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);

  const billingMode: BillingMode = t.installmentEnabled
    ? "INSTALLMENT_PLAN"
    : t.isRecurring
      ? "RECURRING"
      : "ONE_TIME";

  function handleBillingChange(next: BillingMode) {
    if (next === "ONE_TIME") {
      onUpdate({ isRecurring: false, installmentEnabled: false });
    } else if (next === "RECURRING") {
      onUpdate({ isRecurring: true, installmentEnabled: false });
    } else {
      onUpdate({ isRecurring: false, installmentEnabled: true });
    }
  }

  return (
    <div className="space-y-4">
      {/* (Description moved to the Details step — it's tier info, not pricing.) */}

      {/* Pricing model — fixed vs PWYW. Above the price so the host picks
          the model before typing the amount. Locked once sales exist. */}
      <div>
        <Eyebrow help="Fixed price charges everyone the same. Pay-what-you-want lets each buyer choose their amount at checkout (with an optional minimum).">
          {tp("basicsStep.pricingModel")}
        </Eyebrow>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <button
            type="button"
            onClick={() => !locked && onUpdate({ priceMode: "fixed" })}
            disabled={locked}
            className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >{tp("common.fixedPrice")}</button>
          <button
            type="button"
            onClick={() => !locked && onUpdate({ priceMode: "pwyw" })}
            disabled={locked}
            className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >{tp("common.payWhatYouWant")}</button>
        </div>
        {t.priceMode === "pwyw" && (
          <p className="text-[11px] text-zinc-500 mt-1.5">
            {tp("basicsStep.buyersChooseTheAmountAt")}
          </p>
        )}
      </div>

      {/* Price + Currency */}
      <div className="grid grid-cols-[1fr_120px] gap-2.5">
        <div>
          <Eyebrow>{t.priceMode === "pwyw" ? tp("basicsStep.suggestedPriceOptional") : t.vatCategory && t.vatCategory !== "EXEMPT" ? tp("basicsStep.priceBeforeVat") : tp("common.price")}</Eyebrow>
          <div className="mt-1">
            <StepInput
              type="number" min="0" step="0.01" value={t.price}
              onChange={(e) => onUpdate({ price: e.target.value })}
              placeholder={t.priceMode === "pwyw" ? tp("basicsStep.noSuggestion") : "0.00"}
              locked={locked}
              prefix={sym}
              title={locked ? tp("basicsStep.refundAllSalesFirstTo") : undefined}
            />
          </div>
        </div>
        <div>
          <Eyebrow>{tp("common.currency")}</Eyebrow>
          <Select value={t.currency} onValueChange={(v) => onUpdate({ currency: v })} disabled={locked}>
            <SelectTrigger className={`h-[38px] mt-1 text-[13px] ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : ""}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="text-zinc-500 mr-1">{c.symbol}</span>{c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PayoutsInEurosNote currency={t.currency} />
        </div>
      </div>

      {/* PWYW minimum — the floor under the buyer-chosen amount. */}
      <Collapse open={t.priceMode === "pwyw"}>
        <div>
          <Eyebrow>{tp("basicsStep.minimumAmountOptional")}</Eyebrow>
          <div className="mt-1 max-w-[220px]">
            <StepInput
              type="number" min="0" step="0.01" value={t.pwywMin}
              onChange={(e) => onUpdate({ pwywMin: e.target.value })}
              placeholder={tp("common.noMinimum")}
              locked={locked}
              prefix={sym}
            />
          </div>
        </div>
      </Collapse>

      {/* Billing mode — marketplace products expose all three modes.
          Recurring exposes a weekly/monthly/yearly interval dropdown inline;
          installment-plan exposes its schedule editor below. Recurring and
          installment-plan are mutually exclusive. */}
      <div>
        <Eyebrow help="One-time charges the full price at checkout. Recurring is a Stripe subscription that renews automatically. Installment plan splits the total into equal monthly charges you configure below.">
          {tp("basicsStep.billingMode")}
        </Eyebrow>
        <div className="mt-1.5">
          <BillingRadio
            value={billingMode}
            onChange={handleBillingChange}
            disabled={locked}
            options={[
              {
                value: "ONE_TIME",
                label: tp("basicsStep.oneTime"),
                description: tp("basicsStep.buyersPayTheFullPrice"),
              },
              {
                value: "RECURRING",
                label: tp("common.recurring"),
                description: tp("basicsStep.stripeSubscriptionChargesRenewAutomatically"),
              },
              {
                value: "INSTALLMENT_PLAN",
                label: tp("basicsStep.installmentPlan"),
                description: tp("basicsStep.buyersPayInEqualMonthly"),
              },
            ]}
          />
        </div>
        {locked && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            {tp("basicsStep.billingModeIsLockedWhile")}
          </p>
        )}
      </div>

      {/* Recurring interval — surfaced inline when Recurring is the active
          mode. Hidden otherwise (one-time + installment-plan have no
          interval concept). */}
      <Collapse open={t.isRecurring}>
        <div className="grid grid-cols-[120px_1fr] gap-2.5 items-center">
          <Eyebrow>{tp("basicsStep.interval")}</Eyebrow>
          <Select
            value={t.recurringInterval}
            onValueChange={(v) => onUpdate({ recurringInterval: v })}
            disabled={locked}
          >
            <SelectTrigger className="h-[34px] text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">{tp("basicsStep.weekly")}</SelectItem>
              <SelectItem value="monthly">{tp("common.monthly")}</SelectItem>
              <SelectItem value="yearly">{tp("common.yearly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Collapse>

      {/* Installment schedule — only meaningful when Billing mode is
          INSTALLMENT_PLAN. Four fields: total, charges, interval, and access
          duration. Validation lives in helpers.validateTier; the user sees a
          per-field hint instead. */}
      <Collapse open={t.installmentEnabled}>
        <div className="space-y-2">
          <div>
            <Eyebrow>{tp("basicsStep.installmentSchedule")}</Eyebrow>
            <p className="text-[11px] text-zinc-500 mt-1">
              {tp("basicsStep.theTotalBelowIsCharged")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Eyebrow>{tp("basicsStep.totalWithSymbol", { symbol: sym })}</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="0" step="0.01" value={t.installmentTotal}
                  onChange={(e) => onUpdate({ installmentTotal: e.target.value })}
                  placeholder="300"
                  locked={locked}
                />
              </div>
            </div>
            <div>
              <Eyebrow>{tp("basicsStep.charges")}</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="2" step="1" value={t.installmentCount}
                  onChange={(e) => onUpdate({ installmentCount: e.target.value })}
                  placeholder="3"
                  locked={locked}
                />
              </div>
            </div>
            <div>
              <Eyebrow>{tp("basicsStep.everyMonths")}</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="1" step="1" value={t.installmentInterval}
                  onChange={(e) => onUpdate({ installmentInterval: e.target.value })}
                  placeholder="1"
                  locked={locked}
                />
              </div>
            </div>
            <div>
              <Eyebrow>{tp("basicsStep.accessMonths")}</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="1" step="1" value={t.installmentAccessMonths}
                  onChange={(e) => onUpdate({ installmentAccessMonths: e.target.value })}
                  placeholder="12"
                  locked={locked}
                />
              </div>
            </div>
          </div>
          {t.installmentEnabled
            && t.installmentTotal
            && t.installmentCount
            && parseInt(t.installmentCount, 10) >= 2 && (
            <p className="text-[11px] text-zinc-500">
              {tp("basicsStep.installmentSummary", { amount: `${sym}${(parseFloat(t.installmentTotal) / parseInt(t.installmentCount, 10)).toFixed(2)}`, every: Number(t.installmentInterval || "1"), count: Number(t.installmentCount) })}{t.installmentAccessMonths ? tp("basicsStep.installmentAccess", { months: Number(t.installmentAccessMonths) }) : ""}.
            </p>
          )}
          {locked && (
            <p className="text-[10px] text-amber-600">
              {tp("basicsStep.installmentPlanIsLockedWhile")}
            </p>
          )}
        </div>
      </Collapse>

      {/* Member pricing — community-only per-segment discount overrides.
          Folded in here so this step owns ALL pricing config. */}
      {showMemberPricing && (
        /* data-member-pricing-anchor: where PriceEditModal's
           focusMemberPricing scrolls to (the wizard's "Member prices" row). */
        <div className="pt-3 border-t border-zinc-100 scroll-mt-4" data-member-pricing-anchor="">
          <MembersStep
            t={t}
            memberPricingState={memberPricingState}
            onMemberPricingRowChange={onMemberPricingRowChange}
            showToast={showToast ?? (() => {})}
            draftMode={draftMode}
          />
        </div>
      )}
    </div>
  );
}
