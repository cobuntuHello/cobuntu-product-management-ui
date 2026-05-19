"use client";

import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Plus, Trash2, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";

/**
 * Tier list + donations block for product create / edit.
 *
 * Controlled component — owns no draft state of its own, just renders
 * the list its parent gives it and emits patches via `onChange`. Two
 * sections:
 *
 *  - Tier list: name + price + currency + capacity + priceMode (fixed
 *    or pay-what-you-want) + isRecurring + interval, per tier.
 *  - Donations sidecar: enabled + fixed-amount list OR pwyw-with-floor.
 *
 * Shape mirrors `ProductService.createProduct({ tiers, donationConfig })`
 * on the backend — the consuming app's submit handler calls
 * `tierDraftsToPayload` / `donationDraftToPayload` to convert before
 * sending.
 */

const SUPPORTED_CURRENCIES = [
  { code: "EUR", symbol: "€" }, { code: "USD", symbol: "$" }, { code: "GBP", symbol: "£" },
  { code: "BRL", symbol: "R$" }, { code: "CHF", symbol: "CHF" }, { code: "CAD", symbol: "$" },
  { code: "AUD", symbol: "$" }, { code: "JPY", symbol: "¥" },
];

function symbolOf(code: string) {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code;
}

// ─── Tier types ────────────────────────────────────────────────

export interface TierDraft {
  name: string;
  description: string;
  /** Major units as a string (form-friendly). */
  price: string;
  currency: string;
  capacity: string;
  isRecurring: boolean;
  recurringInterval: "monthly" | "yearly";
  priceMode: "fixed" | "pwyw";
  /** PWYW floor in major units. */
  pwywMin: string;
}

export function blankTier(currency = "EUR", indexHint = 1): TierDraft {
  return {
    name: indexHint === 1 ? "Standard" : `Tier ${indexHint}`,
    description: "",
    price: "",
    currency,
    capacity: "",
    isRecurring: false,
    recurringInterval: "monthly",
    priceMode: "fixed",
    pwywMin: "",
  };
}

function toSmallestUnit(majorAmount: number, currency: string): number {
  return currency === "JPY" ? Math.round(majorAmount) : Math.round(majorAmount * 100);
}

/**
 * Convert TierDraft[] to the backend `tiers` array shape expected by
 * `POST /products/upload/start` + `ProductService.createProduct({ tiers })`.
 */
export function tierDraftsToPayload(tiers: TierDraft[]) {
  return tiers
    .filter(t => t.name.trim())
    .map(t => ({
      name: t.name.trim(),
      description: t.description.trim() || undefined,
      price: parseFloat(t.price) || 0,
      currency: t.currency,
      capacity: t.capacity ? parseInt(t.capacity, 10) : undefined,
      isRecurring: t.isRecurring,
      recurringInterval: t.isRecurring ? t.recurringInterval : undefined,
      priceMode: t.priceMode,
      pwywMinAmount:
        t.priceMode === "pwyw" && t.pwywMin
          ? toSmallestUnit(parseFloat(t.pwywMin), t.currency)
          : undefined,
    }));
}

// ─── Donations types ───────────────────────────────────────────

export interface DonationDraft {
  enabled: boolean;
  mode: "fixed" | "pwyw";
  /** Major-unit amounts as strings. */
  amounts: string[];
  minAmount: string;
  currency: string;
  label: string;
}

export function blankDonation(currency = "EUR"): DonationDraft {
  return { enabled: false, mode: "fixed", amounts: ["5", "10", "25"], minAmount: "", currency, label: "" };
}

/**
 * Convert DonationDraft to the backend `donationConfig` shape, or
 * `null` if disabled. Returns `undefined` when nothing should change.
 */
export function donationDraftToPayload(d: DonationDraft): unknown {
  if (!d.enabled) return null;
  const currency = d.currency || "EUR";
  if (d.mode === "fixed") {
    const amounts = d.amounts
      .map(a => a.trim())
      .filter(a => a !== "")
      .map(a => toSmallestUnit(parseFloat(a), currency));
    return { enabled: true, mode: "fixed", amounts, currency, label: d.label.trim() || undefined };
  }
  // pwyw
  const minAmount = d.minAmount.trim() ? toSmallestUnit(parseFloat(d.minAmount), currency) : null;
  return { enabled: true, mode: "pwyw", minAmount, currency, label: d.label.trim() || undefined };
}

// ─── Component ─────────────────────────────────────────────────

interface Props {
  tiers: TierDraft[];
  onTiersChange: (tiers: TierDraft[]) => void;
  donation: DonationDraft;
  onDonationChange: (d: DonationDraft) => void;
  showErrors?: boolean;
}

export function ProductTiersAndDonations({
  tiers, onTiersChange, donation, onDonationChange, showErrors,
}: Props) {
  // Seed an empty list with one default tier so the form is never blank
  // when first switched into multi-tier mode.
  useEffect(() => {
    if (tiers.length === 0) {
      onTiersChange([blankTier()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateTier(i: number, patch: Partial<TierDraft>) {
    onTiersChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTier() {
    const baseCurrency = tiers[0]?.currency || "EUR";
    onTiersChange([...tiers, blankTier(baseCurrency, tiers.length + 1)]);
  }
  function removeTier(i: number) {
    if (tiers.length === 1) return; // always keep at least one
    onTiersChange(tiers.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-6">
      {/* ─── Tier list ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-zinc-700">Price tiers</h4>
          <span className="text-[11px] text-zinc-400">Each tier is its own checkout option.</span>
        </div>
        <div className="space-y-3">
          {tiers.map((t, i) => (
            <TierRow
              key={i}
              tier={t}
              index={i}
              showErrors={showErrors}
              canRemove={tiers.length > 1}
              onPatch={patch => updateTier(i, patch)}
              onRemove={() => removeTier(i)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addTier}
          className="w-full flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium text-zinc-500 border border-dashed border-zinc-300 rounded-xl hover:border-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add tier
        </button>
      </div>

      {/* ─── Donations sidecar ─── */}
      <DonationsBlock donation={donation} onChange={onDonationChange} />
    </div>
  );
}

// ─── TierRow ───────────────────────────────────────────────────

function TierRow({
  tier, index, showErrors, canRemove, onPatch, onRemove,
}: {
  tier: TierDraft;
  index: number;
  showErrors?: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<TierDraft>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const priceError = showErrors && tier.priceMode === "fixed" && (!tier.price || parseFloat(tier.price) <= 0);
  const nameError = showErrors && !tier.name.trim();

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* Compact header — two side-by-side buttons (expand/collapse + remove)
          so the delete control isn't nested inside the row toggle, which
          would be invalid HTML and would silently swallow the click. */}
      <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 rounded-lg">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
        >
          {expanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRightIcon className="h-4 w-4 text-zinc-400" />}
          <span className="text-sm font-medium text-zinc-800 truncate">{tier.name || "Untitled tier"}</span>
          {tier.priceMode === "pwyw" ? (
            <span className="text-xs text-zinc-500">Pay what you want</span>
          ) : tier.price ? (
            <span className="text-xs text-zinc-500">{symbolOf(tier.currency)}{tier.price}</span>
          ) : null}
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-zinc-400 hover:text-red-500 cursor-pointer p-1 shrink-0"
            aria-label="Remove tier"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-100">
          <div className="space-y-2 pt-3">
            <Label>Name</Label>
            <Input
              value={tier.name}
              onChange={e => onPatch({ name: e.target.value })}
              placeholder="Tier name"
              error={nameError ? "Tier name is required" : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={tier.currency} onValueChange={v => onPatch({ currency: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pricing mode</Label>
              <Select value={tier.priceMode} onValueChange={v => onPatch({ priceMode: v as "fixed" | "pwyw" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed price</SelectItem>
                  <SelectItem value="pwyw">Pay what you want</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tier.priceMode === "fixed" ? (
            <div className="space-y-2">
              <Label>Price ({symbolOf(tier.currency)})</Label>
              <Input
                type="number" min={0} step={0.01}
                value={tier.price}
                onChange={e => onPatch({ price: e.target.value })}
                placeholder="0.00"
                error={priceError ? "Price is required" : undefined}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Minimum (optional, {symbolOf(tier.currency)})</Label>
              <Input
                type="number" min={0} step={0.01}
                value={tier.pwywMin}
                onChange={e => onPatch({ pwywMin: e.target.value })}
                placeholder="No floor — buyer picks any amount"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Capacity (optional)</Label>
            <Input
              type="number" min={0}
              value={tier.capacity}
              onChange={e => onPatch({ capacity: e.target.value })}
              placeholder="Unlimited"
            />
          </div>

          {/* Recurring */}
          <div className="rounded-md bg-zinc-50 px-3 py-2 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-zinc-700">Subscription</span>
              <span className="text-xs text-zinc-400">{tier.isRecurring ? "Recurring billing" : "One-time payment"}</span>
            </div>
            <Switch checked={tier.isRecurring} onCheckedChange={v => onPatch({ isRecurring: v })} />
          </div>
          {tier.isRecurring && (
            <div className="space-y-2">
              <Label>Billing interval</Label>
              <Select
                value={tier.recurringInterval}
                onValueChange={v => onPatch({ recurringInterval: v as "monthly" | "yearly" })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DonationsBlock ────────────────────────────────────────────

function DonationsBlock({
  donation, onChange,
}: {
  donation: DonationDraft;
  onChange: (d: DonationDraft) => void;
}) {
  function patch(p: Partial<DonationDraft>) { onChange({ ...donation, ...p }); }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-zinc-700">Accept donations</span>
            <span className="text-xs text-zinc-400">Buyers can add a tip on top of any tier.</span>
          </div>
          <Switch checked={donation.enabled} onCheckedChange={v => patch({ enabled: v })} />
        </div>

        {donation.enabled && (
          <div className="space-y-3 pt-1">
            <div className="space-y-2">
              <Label>Donation mode</Label>
              <Select value={donation.mode} onValueChange={v => patch({ mode: v as "fixed" | "pwyw" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Suggested amounts</SelectItem>
                  <SelectItem value="pwyw">Any amount</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {donation.mode === "fixed" ? (
              <div className="space-y-2">
                <Label>Amounts ({symbolOf(donation.currency)})</Label>
                {donation.amounts.map((amt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="number" min={0} step={0.01}
                      value={amt}
                      onChange={e => {
                        const next = [...donation.amounts];
                        next[i] = e.target.value;
                        patch({ amounts: next });
                      }}
                      placeholder="0.00"
                    />
                    {donation.amounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => patch({ amounts: donation.amounts.filter((_, j) => j !== i) })}
                        className="text-zinc-400 hover:text-red-500 cursor-pointer"
                        aria-label="Remove amount"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patch({ amounts: [...donation.amounts, ""] })}
                  className="text-xs text-zinc-500 hover:text-zinc-700 cursor-pointer flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add amount
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Minimum (optional, {symbolOf(donation.currency)})</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={donation.minAmount}
                  onChange={e => patch({ minAmount: e.target.value })}
                  placeholder="No minimum"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input
                value={donation.label}
                onChange={e => patch({ label: e.target.value })}
                placeholder='e.g. "Support the work"'
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
