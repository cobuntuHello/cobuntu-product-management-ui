"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui/select";
import {
  BillingRadio,
  type BillingMode,
} from "@cobuntu/management-ui-shared";
import { SUPPORTED_CURRENCIES, type DraftTier } from "../types";
import { getSymbol, isTierLocked } from "../helpers";
import { Eyebrow } from "../_primitives";

export interface BasicsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Basics" step — the canonical fields every tier needs: name, price,
 * currency, billing mode. Marketplace products expose all three modes:
 *   - ONE_TIME (one-off purchase, no recurring schedule)
 *   - RECURRING (subscription with weekly/monthly/yearly interval)
 *   - INSTALLMENT_PLAN (split-pay with access duration, configured in
 *     the Options step)
 *
 * Recurring and installment-plan are mutually exclusive — Stripe
 * checkout can't satisfy both subscription_data shapes in one
 * session. BillingRadio enforces the radio semantics; flipping into
 * INSTALLMENT_PLAN turns isRecurring off, and vice versa.
 */
export function BasicsStep({ t, onUpdate }: BasicsStepProps) {
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
      {/* Name */}
      <div>
        <Eyebrow>Tier name</Eyebrow>
        <input
          type="text"
          value={t.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Standard, Pro, Enterprise…"
          className="w-full mt-1 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
        />
      </div>

      {/* Price + Currency */}
      <div className="grid grid-cols-[1fr_120px] gap-2.5">
        <div>
          <Eyebrow>{t.priceMode === "pwyw" ? "Suggested price" : "Price"}</Eyebrow>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
            <input
              type="number" min="0" step="0.01" value={t.price}
              onChange={(e) => onUpdate({ price: e.target.value })}
              placeholder="0.00"
              disabled={locked}
              title={locked ? "Refund all sales first to change price" : undefined}
              className={`w-full pl-7 pr-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
            />
          </div>
        </div>
        <div>
          <Eyebrow>Currency</Eyebrow>
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
        </div>
      </div>

      {/* Billing mode — One-time / Recurring / Installment plan.
          Recurring exposes a weekly/monthly/yearly interval dropdown
          inline; installment-plan defers its schedule editor to the
          Options step. */}
      <div>
        <Eyebrow>Billing mode</Eyebrow>
        <div className="mt-1.5">
          <BillingRadio
            value={billingMode}
            onChange={handleBillingChange}
            disabled={locked}
            options={[
              {
                value: "ONE_TIME",
                label: "One-time",
                description: "Buyers pay the full price at checkout.",
              },
              {
                value: "RECURRING",
                label: "Recurring",
                description: "Stripe subscription. Charges renew automatically.",
              },
              {
                value: "INSTALLMENT_PLAN",
                label: "Installment plan",
                description: "Buyers pay in equal monthly charges; configure the schedule + access duration in the Options step.",
              },
            ]}
          />
        </div>
        {locked && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            Billing mode is locked while sales exist. Refund all sales first to change.
          </p>
        )}
      </div>

      {/* Recurring interval — surfaced inline when Recurring is the
          active mode. Hidden otherwise (installment-plan and one-time
          have no interval concept). */}
      {t.isRecurring && (
        <div className="grid grid-cols-[120px_1fr] gap-2.5 items-center">
          <Eyebrow>Interval</Eyebrow>
          <Select
            value={t.recurringInterval}
            onValueChange={(v) => onUpdate({ recurringInterval: v })}
            disabled={locked}
          >
            <SelectTrigger className="h-[34px] text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
