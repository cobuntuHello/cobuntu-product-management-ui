"use client";

import { Trash2, Plus } from "lucide-react";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";

export interface DonationsSectionProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
}

/**
 * Sidecar donation config for marketplace products. Saved separately
 * from tiers via PUT /products/:id/donations. Two modes:
 *   - Suggested amounts: chip list. Buyer picks one at checkout.
 *   - Pay-what-you-want (PWYW): buyer enters any amount; optional minimum.
 *
 * Currency follows the first tier's currency by default — if it diverges,
 * sellers can override. Mirrors @cobuntu/event-management-ui's
 * DonationsSection with slightly tighter density (smaller chips +
 * inputs) for the marketplace tier-card density.
 */
export function DonationsSection({ donation, onUpdate, defaultCurrency }: DonationsSectionProps) {
  const sym = getSymbol(donation.currency || defaultCurrency);

  function addAmount() {
    onUpdate({ amounts: [...donation.amounts, ""] });
  }
  function updateAmount(idx: number, value: string) {
    const next = [...donation.amounts];
    next[idx] = value;
    onUpdate({ amounts: next });
  }
  function removeAmount(idx: number) {
    onUpdate({ amounts: donation.amounts.filter((_, i) => i !== idx) });
  }

  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden mt-3">
      <div className="px-3 py-2.5 flex items-center gap-3 border-b border-zinc-100">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-900">Donations</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Optional add-on at checkout. Buyer chooses an amount on top of the product price.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onUpdate({ enabled: !donation.enabled })}
          className={`relative shrink-0 rounded-full cursor-pointer transition-colors duration-200 ease-out ${donation.enabled ? "bg-zinc-900" : "bg-zinc-200"}`}
          style={{ width: 36, height: 20 }}
          aria-pressed={donation.enabled}
          aria-label="Toggle donations"
        >
          <span
            className="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
            style={{ transform: donation.enabled ? "translateX(18px)" : "translateX(2px)" }}
          />
        </button>
      </div>

      {donation.enabled && (
        <div className="px-3 py-3 space-y-3">
          <div>
            <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdate({ mode: "fixed" })}
                className={`px-3 py-2 text-[12px] rounded border cursor-pointer transition-colors ${donation.mode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
              >Suggested amounts</button>
              <button
                type="button"
                onClick={() => onUpdate({ mode: "pwyw" })}
                className={`px-3 py-2 text-[12px] rounded border cursor-pointer transition-colors ${donation.mode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
              >Pay what you want</button>
            </div>
          </div>

          {donation.mode === "fixed" && (
            <div>
              <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">Suggested amounts</label>
              <div className="flex flex-wrap gap-2">
                {donation.amounts.map((a, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 pointer-events-none">{sym}</span>
                    <input
                      type="number" min="0" step="0.01" value={a}
                      onChange={e => updateAmount(i, e.target.value)}
                      placeholder="10"
                      className="w-[80px] pl-6 pr-7 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {donation.amounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAmount(i)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-zinc-300 hover:text-red-500 cursor-pointer"
                        aria-label="Remove amount"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {donation.amounts.length < 8 && (
                  <button
                    type="button"
                    onClick={addAmount}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[12px] font-medium text-zinc-500 border border-dashed border-zinc-300 rounded hover:border-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            </div>
          )}

          {donation.mode === "pwyw" && (
            <div>
              <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">Minimum (optional)</label>
              <div className="relative max-w-[180px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={donation.minAmount}
                  onChange={e => onUpdate({ minAmount: e.target.value })}
                  placeholder="No minimum"
                  className="w-full pl-7 pr-3 py-1.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
