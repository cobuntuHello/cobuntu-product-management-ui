"use client";

import type { ReactNode } from "react";
import { BadgePercent } from "lucide-react";
import { formatMoney } from "@cobuntu/management-ui-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { DraftTier } from "./PriceEditModal/types";
import { getSymbol, toSmallestUnit } from "./PriceEditModal/helpers";
import type {
  CommunitySegment,
  MemberPricingMode,
  MemberPricingRow,
  RecurringScope,
} from "./PriceEditModal/member-pricing";
import type { MemberPricingScope } from "./MemberPricingSection";

/**
 * The create wizard's "Member prices" step: a lower price per membership tier,
 * on each variant that charges.
 *
 * Why a step of its own. Member pricing has been settable at create time since
 * 2026-09-16, first at the bottom of each variant's editor, then (2026-11-10)
 * as a "Member prices" row under the prices. Sellers missed both and kept
 * reporting that there was no way to give members a discount (Pathseekers,
 * 2026-11-10 and again 2026-11-12). The row also hid itself whenever the tier
 * list did not load or nothing was priced yet, so "missing" and "not available
 * here" looked the same. A step is always in the rail, and when nothing can be
 * priced it says why instead of showing nothing.
 *
 * Purely presentational. ProductForm owns the rows (seeded from each variant's
 * `draftMemberPricing`, folded back on every valid change), the tier list and
 * its loading state, so moving between steps keeps everything.
 */

export interface MemberPricesStepLabels {
  /** Intro for a seller's own item listed in a community. */
  introSeller: string;
  /** Intro for an item the community itself sells. */
  introCommunity: string;
  loading: string;
  loadFailed: string;
  retry: string;
  /** The community publishes no tier a seller can price. */
  noTiersSeller: string;
  /** The community has no tiers at all. */
  noTiersCommunity: string;
  /** Every variant is free, so there is no price to lower. */
  nothingPriced: string;
  modeFree: string;
  modePercent: string;
  modeFlat: string;
  modeFixed: string;
  /** Accessible name of the mode picker. `{tier}` is the membership tier. */
  modeLabel: string;
  /** Accessible name of the amount field. `{tier}` is the membership tier. */
  valueLabel: string;
  /** Accessible name of a tier's checkbox. `{tier}` is the membership tier. */
  offerTo: string;
  everyRenewal: string;
  firstPaymentOnly: string;
  /** A pay-what-you-want variant has no single list price to show. */
  payWhatYouWant: string;
  /** A paid variant whose price is still blank. */
  priceNotSet: string;
  /** `{tier}`: an enabled tier with no usable amount. */
  errorValue: string;
  /** `{tier}`: a percentage outside 1 to 100. */
  errorPercent: string;
}

export const DEFAULT_MEMBER_PRICES_STEP_LABELS: MemberPricesStepLabels = {
  introSeller: "Optional. Give this community's members a lower price than everyone else. The community approves it along with your listing.",
  introCommunity: "Optional. Give members of your tiers a lower price than everyone else.",
  loading: "Loading membership tiers…",
  loadFailed: "The membership tiers didn't load.",
  retry: "Try again",
  noTiersSeller: "This community hasn't published any membership tiers yet, so there's no member price to set.",
  noTiersCommunity: "Your community has no membership tiers yet, so there's no member price to set.",
  nothingPriced: "Everything here is free, so there's no price to lower. Set a price on the previous step to offer members a lower one.",
  modeFree: "Free for these members",
  modePercent: "% off",
  modeFlat: "Amount off",
  modeFixed: "Fixed price",
  modeLabel: "How the price for {tier} works",
  valueLabel: "Member price for {tier}",
  offerTo: "Offer {tier} a member price",
  everyRenewal: "Every renewal",
  firstPaymentOnly: "First payment only",
  payWhatYouWant: "Pay what you want",
  priceNotSet: "No price yet",
  errorValue: "Enter an amount for {tier}, or untick it.",
  errorPercent: "{tier}: the discount must be a whole number from 1 to 100.",
};

const fill = (template: string, tier: string) => template.split("{tier}").join(tier);

/**
 * What is wrong with one row, or null. The same rules the variant editor's
 * save applies (findFirstValidationError), worded for this step and with whole
 * percentages only: the backend stores an integer and buildUpsertBody would
 * otherwise drop the decimals without saying so.
 */
export function memberPriceRowError(
  r: Pick<MemberPricingRow, "enabled" | "mode" | "value" | "segmentName">,
  labels: Pick<MemberPricesStepLabels, "errorValue" | "errorPercent"> = DEFAULT_MEMBER_PRICES_STEP_LABELS,
): string | null {
  if (!r.enabled || r.mode === "FREE") return null;
  const raw = (r.value ?? "").trim();
  const v = Number(raw);
  if (raw === "" || !Number.isFinite(v) || v < 0) return fill(labels.errorValue, r.segmentName);
  if (r.mode === "PERCENT_OFF" && (!Number.isInteger(v) || v < 1 || v > 100)) {
    return fill(labels.errorPercent, r.segmentName);
  }
  return null;
}

export type MemberPricesSegmentsStatus = "loading" | "error" | "ready";

export interface MemberPricesStepProps {
  scope: MemberPricingScope;
  status: MemberPricesSegmentsStatus;
  segments: CommunitySegment[];
  /** The variants a member price applies to (they charge, or are PWYW). */
  tiers: DraftTier[];
  /** Rows per variant, keyed by the variant's localId. */
  rowsByTier: ReadonlyMap<string, MemberPricingRow[]>;
  /** After a refused Next: show every problem, empty amounts included. */
  showErrors?: boolean;
  onRowChange: (localId: string, segmentId: string, patch: Partial<MemberPricingRow>) => void;
  onRetry: () => void;
  labels?: Partial<MemberPricesStepLabels>;
}

function listPriceText(t: DraftTier, L: MemberPricesStepLabels): string {
  if (t.priceMode === "pwyw") return L.payWhatYouWant;
  const raw = (t.price ?? "").trim();
  const n = parseFloat(raw);
  if (raw === "" || Number.isNaN(n)) return L.priceNotSet;
  const currency = (t.currency || "EUR").toUpperCase();
  return formatMoney(toSmallestUnit(n, currency), currency);
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 px-4 py-4">
      <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-amber-100 text-amber-600 shrink-0">
        <BadgePercent className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm text-zinc-600 pt-1">{children}</div>
    </div>
  );
}

export function MemberPricesStep({
  scope,
  status,
  segments,
  tiers,
  rowsByTier,
  showErrors,
  onRowChange,
  onRetry,
  labels,
}: MemberPricesStepProps) {
  const L = { ...DEFAULT_MEMBER_PRICES_STEP_LABELS, ...(labels ?? {}) };

  let body: ReactNode;
  if (status === "loading") {
    body = <p className="text-sm text-zinc-400">{L.loading}</p>;
  } else if (status === "error") {
    body = (
      <Note>
        <span>{L.loadFailed}</span>{" "}
        <button
          type="button"
          onClick={onRetry}
          className="font-medium text-zinc-800 underline underline-offset-2 cursor-pointer"
        >
          {L.retry}
        </button>
      </Note>
    );
  } else if (segments.length === 0) {
    body = <Note>{scope === "seller" ? L.noTiersSeller : L.noTiersCommunity}</Note>;
  } else if (tiers.length === 0) {
    body = <Note>{L.nothingPriced}</Note>;
  } else {
    body = tiers.map((t) => {
      const rows = rowsByTier.get(t.localId) ?? [];
      const sym = getSymbol(t.currency);
      return (
        <div key={t.localId} className="rounded-2xl border border-zinc-100 overflow-hidden" data-testid="member-prices-variant">
          <div className="flex items-baseline justify-between gap-3 px-4 py-3 bg-zinc-50">
            <span className="min-w-0 truncate text-sm font-medium text-zinc-800">{t.name.trim()}</span>
            <span className="shrink-0 text-[12.5px] text-zinc-500">{listPriceText(t, L)}</span>
          </div>
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const error = memberPriceRowError(r, L);
              // An empty amount on a freshly ticked tier is the normal way to
              // start, so it is only called out after a refused Next; a wrong
              // value someone has typed shows at once.
              const showError = !!error && (showErrors || r.value.trim() !== "");
              return (
                <div key={r.segmentId} className="px-4 py-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => onRowChange(t.localId, r.segmentId, { enabled: e.target.checked })}
                      aria-label={fill(L.offerTo, r.segmentName)}
                      className="h-4 w-4 rounded border-zinc-300 cursor-pointer accent-[var(--brand-color,#18181b)]"
                    />
                    <span className="min-w-0 truncate text-sm text-zinc-800">{r.segmentName}</span>
                  </label>
                  {r.enabled && (
                    <div className="mt-2.5 ml-7 flex flex-wrap items-center gap-2">
                      <Select
                        value={r.mode}
                        onValueChange={(v) => onRowChange(t.localId, r.segmentId, { mode: v as MemberPricingMode })}
                      >
                        <SelectTrigger className="h-9 w-[190px] text-[13px]" aria-label={fill(L.modeLabel, r.segmentName)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIXED_PRICE">{L.modeFixed}</SelectItem>
                          <SelectItem value="PERCENT_OFF">{L.modePercent}</SelectItem>
                          <SelectItem value="FLAT_OFF">{L.modeFlat}</SelectItem>
                          <SelectItem value="FREE">{L.modeFree}</SelectItem>
                        </SelectContent>
                      </Select>
                      {r.mode !== "FREE" && (
                        <div className="relative">
                          {r.mode !== "PERCENT_OFF" && (
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">{sym}</span>
                          )}
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={r.mode === "PERCENT_OFF" ? 100 : undefined}
                            step={r.mode === "PERCENT_OFF" ? 1 : 0.01}
                            value={r.value}
                            onChange={(e) => onRowChange(t.localId, r.segmentId, { value: e.target.value })}
                            aria-label={fill(L.valueLabel, r.segmentName)}
                            aria-invalid={showError || undefined}
                            className={`h-9 w-[120px] ${r.mode === "PERCENT_OFF" ? "pl-3 pr-8" : "pl-7 pr-3"} text-[13px] text-zinc-900 border rounded-lg focus:outline-none ${showError ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                          />
                          {r.mode === "PERCENT_OFF" && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">%</span>
                          )}
                        </div>
                      )}
                      {t.isRecurring && (
                        <Select
                          value={r.recurringScope}
                          onValueChange={(v) => onRowChange(t.localId, r.segmentId, { recurringScope: v as RecurringScope })}
                        >
                          <SelectTrigger className="h-9 w-[170px] text-[13px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALWAYS">{L.everyRenewal}</SelectItem>
                            <SelectItem value="FIRST_ONLY">{L.firstPaymentOnly}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  {showError && <p className="mt-2 ml-7 text-[12px] text-red-600" role="alert">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  }

  return (
    <section className="space-y-4" data-testid="member-prices-step">
      <p className="text-sm text-zinc-500">{scope === "seller" ? L.introSeller : L.introCommunity}</p>
      {body}
    </section>
  );
}
