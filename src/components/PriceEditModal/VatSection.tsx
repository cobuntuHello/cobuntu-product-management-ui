"use client";

/**
 * Seller VAT on a product or course (backend docs/features/seller-vat.md).
 *
 * The price is always entered before VAT; this only chooses the rate, and the
 * preview says what buyers pay at checkout. Products follow the EU small-seller
 * rule, so the rate is the seller's own country's for buyers in the EU, and
 * buyers outside the EU pay none. When VAT cannot apply here (no VAT number,
 * threshold not confirmed, a subscription...) the section shows the server's
 * reason instead of offering a rate it would refuse.
 */
import { Eyebrow } from "./_primitives";
import { toSmallestUnit, fromSmallestUnit } from "./helpers";
import type { DraftTier, VatCategory, VatOptions } from "./types";

export interface VatSectionProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** undefined = loading; null = not offered here (create flow, fetch failed). */
  options: VatOptions | null | undefined;
  locked: boolean;
}

const CATEGORY_NAME: Record<VatCategory, string> = {
  STANDARD: "standard",
  INTERMEDIATE: "intermediate",
  REDUCED: "reduced",
  SUPER_REDUCED: "super-reduced",
  EXEMPT: "exempt",
};

function money(minor: number, currency: string): string {
  const n = Number(fromSmallestUnit(minor, currency));
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** The VAT checkout adds on top of a price before VAT, rounded as the backend and Stripe round it. */
export function vatOnNetMinor(net: number, rate: number): number {
  if (!(net > 0) || !(rate > 0)) return 0;
  return Math.round((net * rate) / 100);
}

export function vatRateFor(options: VatOptions | null | undefined, category: VatCategory | null | undefined): number | null {
  if (!category || !options?.available) return null;
  return options.options.find((o) => o.category === category)?.rate ?? null;
}

export function VatSection({ t, onUpdate, options, locked }: VatSectionProps) {
  if (options === undefined || options === null) return null;
  if (!options.available) {
    if (!options.reasonText) return null;
    return (
      <div>
        <Eyebrow>VAT</Eyebrow>
        <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed" data-testid="vat-unavailable">{options.reasonText}</p>
      </div>
    );
  }

  const label = options.jurisdiction?.label ?? "VAT";
  const rate = vatRateFor(options, t.vatCategory ?? null);
  const exempt = t.vatCategory === "EXEMPT";
  const pwyw = t.priceMode === "pwyw";
  const typed = parseFloat(t.price);
  const net = Number.isFinite(typed) ? toSmallestUnit(typed, t.currency) : null;
  const vat = net != null && rate ? vatOnNetMinor(net, rate) : 0;

  const choose = (next: VatCategory | null) => {
    if (locked) return;
    onUpdate({ vatCategory: next });
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[12px] border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
      active ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
    }`;

  return (
    <div>
      <Eyebrow>VAT</Eyebrow>
      <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed">
        Enter the price before VAT. Buyers in the EU pay {options.jurisdiction?.name ?? "your country"}&rsquo;s
        {" "}{label} on top at checkout, buyers outside the EU pay none, and it is paid to you for you to declare.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="VAT">
        <button type="button" role="radio" aria-checked={!t.vatCategory} disabled={locked} onClick={() => choose(null)} className={chip(!t.vatCategory)}>
          No VAT
        </button>
        {options.options.map((o) => {
          const active = t.vatCategory === o.category;
          return (
            <button key={o.category} type="button" role="radio" aria-checked={active} disabled={locked} onClick={() => choose(o.category)} className={chip(active)}>
              {o.category === "EXEMPT" ? "Exempt (0%)" : `${label} ${o.rate}%`}
              {o.category !== "EXEMPT" && <span className="opacity-60"> · {CATEGORY_NAME[o.category]}</span>}
            </button>
          );
        })}
      </div>
      {t.vatCategory && !exempt && !pwyw && net != null && rate != null && (
        <p className="text-[12px] text-zinc-600 mt-2 leading-relaxed" data-testid="vat-preview">
          Buyers see {money(net, t.currency)} and pay {money(net + vat, t.currency)} at checkout, with {label} {rate}% of{" "}
          {money(vat, t.currency)} added.
        </p>
      )}
      {t.vatCategory && !exempt && pwyw && (
        <p className="text-[12px] text-zinc-500 mt-2">Buyers choose an amount before VAT; {label} is added at checkout.</p>
      )}
      {exempt && <p className="text-[12px] text-zinc-600 mt-2">Exempt from {label}: buyers pay the price as it is.</p>}
      {locked && <p className="text-[11px] text-zinc-400 mt-1.5">This option has sales, so its VAT is locked.</p>}
    </div>
  );
}
