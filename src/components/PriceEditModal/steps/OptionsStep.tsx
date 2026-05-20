"use client";

import type { DraftTier } from "../types";
import { getSymbol, isTierLocked } from "../helpers";
import { Collapse, Eyebrow, StepInput } from "../_primitives";

export interface OptionsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Options" step — everything that isn't the canonical name + price:
 * capacity, pricing model (fixed vs pwyw), pwyw min, and the installment
 * schedule (when billing mode in the Basics step is installment-plan).
 *
 * The installment trio is actually a QUARTET on marketplace products
 * — accessDurationMonths is the 4th field (months of access granted
 * after the buyer signs the plan, even if billing is cancelled early).
 * Distinct from events, where event date bounds access.
 *
 * Validation lives in helpers.validateTier (4-of-none enforced).
 */
export function OptionsStep({ t, onUpdate }: OptionsStepProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);

  return (
    <div className="space-y-4">
      {/* Capacity */}
      <div>
        <Eyebrow>Capacity (optional)</Eyebrow>
        <div className="mt-1">
          <StepInput
            type="number" min={locked ? t.salesCount : 0} step="1" value={t.capacity}
            onChange={(e) => onUpdate({ capacity: e.target.value })}
            placeholder="∞"
          />
        </div>
        {locked && (
          <p className="text-[10px] text-zinc-400 mt-1">Min {t.salesCount} (already sold).</p>
        )}
      </div>

      {/* Pricing model — fixed vs PWYW. */}
      <div>
        <Eyebrow>Pricing model</Eyebrow>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <button
            type="button"
            onClick={() => !locked && onUpdate({ priceMode: "fixed" })}
            disabled={locked}
            className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >Fixed price</button>
          <button
            type="button"
            onClick={() => !locked && onUpdate({ priceMode: "pwyw" })}
            disabled={locked}
            className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >Pay what you want</button>
        </div>
        {t.priceMode === "pwyw" && (
          <p className="text-[11px] text-zinc-500 mt-1.5">
            Buyer chooses the amount at checkout. The price in Basics acts as a suggested default.
          </p>
        )}
      </div>

      {/* PWYW minimum */}
      <Collapse open={t.priceMode === "pwyw"}>
        <div>
          <Eyebrow>Minimum amount (optional)</Eyebrow>
          <div className="mt-1 max-w-[220px]">
            <StepInput
              type="number" min="0" step="0.01" value={t.pwywMin}
              onChange={(e) => onUpdate({ pwywMin: e.target.value })}
              placeholder="No minimum"
              locked={locked}
              prefix={sym}
            />
          </div>
        </div>
      </Collapse>

      {/* Installment schedule — only surfaced when Basics → Billing
          mode is INSTALLMENT_PLAN. Four fields: total, count, interval,
          access. Backend enforces four-of-none + lock-when-sold; the
          same checks run client-side in save() via validateTier(). */}
      <Collapse open={t.installmentEnabled}>
        <div className="space-y-2">
          <div>
            <Eyebrow>Installment schedule</Eyebrow>
            <p className="text-[11px] text-zinc-500 mt-1">
              The total below is charged in equal parts over the count and interval.
              Access is granted for the duration even if the buyer cancels billing early.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Eyebrow>Total ({sym})</Eyebrow>
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
              <Eyebrow>Charges</Eyebrow>
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
              <Eyebrow>Every (months)</Eyebrow>
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
              <Eyebrow>Access (months)</Eyebrow>
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
              Buyer pays {sym}{(parseFloat(t.installmentTotal) / parseInt(t.installmentCount, 10)).toFixed(2)} every {t.installmentInterval || "1"} month{(t.installmentInterval || "1") !== "1" ? "s" : ""} for {t.installmentCount} charges.
              {t.installmentAccessMonths && ` Access granted for ${t.installmentAccessMonths} month${t.installmentAccessMonths !== "1" ? "s" : ""}.`}
            </p>
          )}
          {locked && (
            <p className="text-[10px] text-amber-600">
              Installment plan is locked while sales exist.
            </p>
          )}
        </div>
      </Collapse>

      {!t.installmentEnabled && (
        <p className="text-[11px] text-zinc-400">
          Switch billing mode to "Installment plan" in the Basics step to configure a payment schedule here.
        </p>
      )}
    </div>
  );
}
