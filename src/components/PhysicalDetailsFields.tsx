"use client";

/**
 * The two questions only a physical item answers: its condition, and how big a
 * parcel it posts as.
 *
 * Rendered INLINE on the form, not behind a modal. They were briefly tucked
 * into a "Postage and condition" dialog, but a seller in a hurry never opened
 * it and shipped with both unset — so they sit open in the Pricing &
 * Deliverables step now, like Stock does, where they cannot be walked past
 * without a glance.
 *
 * Both remain OPTIONAL. `condition` stays null when unsaid ("Not specified" is
 * a real, named answer for a shop selling new stock). `parcelClass` always
 * resolves to STANDARD, because a postage rate cannot be quoted without one.
 *
 * The enums mirror services/core/src/shared/listings/physicalListingFields.ts.
 * That normaliser is the authority: it rejects a value outside these lists, and
 * it throws outright if a non-physical product carries either field.
 */

export type ProductConditionValue =
  | "NEW_WITH_TAGS" | "VERY_GOOD" | "GOOD" | "SATISFACTORY";
export type ParcelClassValue = "STANDARD" | "HEAVY";

/*
 * Described by what the buyer would SEE if the parcel arrived, not by an
 * abstract grade. "Good" means nothing on its own; "used a few times, minor
 * signs of wear" is a claim a seller can check their item against, and one a
 * buyer can hold them to when it turns up.
 */
export const CONDITION_OPTIONS: { value: ProductConditionValue; label: string; hint: string }[] = [
  { value: "NEW_WITH_TAGS", label: "New with tags", hint: "Never used, tags still attached" },
  { value: "VERY_GOOD", label: "Very good", hint: "Barely used, no visible wear" },
  { value: "GOOD", label: "Good", hint: "Used a few times, minor signs of wear" },
  { value: "SATISFACTORY", label: "Satisfactory", hint: "Visible wear, still works as it should" },
];

/*
 * Two classes, not a weight field — but each now carries an explicit weight
 * ANCHOR so "heavy" is not one seller's guess against another's. A seller
 * cannot weigh a packed parcel accurately, so we do not ask; naming the band
 * (up to 2 kg / 2-20 kg) makes the pick objective without a scale. The anchors
 * mirror the ranges in the backend's ParcelClass doc comment. When Cobuntu
 * integrates a carrier, ITS tiers become the source of truth and these bands
 * are redrawn to match — until then parcelClass is informational (the seller
 * sets the postage price manually).
 */
export const PARCEL_CLASS_OPTIONS: { value: ParcelClassValue; label: string; weight: string; hint: string }[] = [
  { value: "STANDARD", label: "Standard parcel", weight: "Up to 2 kg", hint: "Clothing, shoes, books, accessories" },
  { value: "HEAVY", label: "Large or heavy", weight: "2–20 kg", hint: "A rug, a chair, a console" },
];

export function conditionLabel(value: ProductConditionValue | null): string | null {
  return CONDITION_OPTIONS.find(o => o.value === value)?.label ?? null;
}

export function parcelClassLabel(value: ParcelClassValue): string {
  return PARCEL_CLASS_OPTIONS.find(o => o.value === value)?.label ?? value;
}

interface Props {
  condition: ProductConditionValue | null;
  parcelClass: ParcelClassValue;
  onConditionChange: (next: ProductConditionValue | null) => void;
  onParcelClassChange: (next: ParcelClassValue) => void;
}

export function PhysicalDetailsFields(
  { condition, parcelClass, onConditionChange, onParcelClassChange }: Props,
) {
  const conditionHint = condition === null
    ? "For new stock sold by a shop, where condition does not apply"
    : (CONDITION_OPTIONS.find(o => o.value === condition)?.hint ?? "");

  return (
    <div className="flex flex-col gap-4">
      {/* Condition — a compact dropdown. Five grades + a named empty answer;
          the selected grade's plain-language hint sits under it. */}
      <div>
        <label htmlFor="product-condition" className="block text-[13px] font-medium text-zinc-800 mb-1.5">Condition</label>
        <select
          id="product-condition"
          value={condition ?? ""}
          onChange={e => onConditionChange(e.target.value === "" ? null : (e.target.value as ProductConditionValue))}
          className="w-full px-3 py-2.5 text-[13.5px] text-zinc-800 bg-white rounded-xl ring-1 ring-zinc-200 focus:outline-none focus:ring-zinc-400 cursor-pointer"
        >
          <option value="">Not specified</option>
          {CONDITION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {conditionHint && <p className="text-[12px] text-zinc-500 mt-1.5">{conditionHint}</p>}
      </div>

      {/* Parcel size — two segmented options, each with its weight anchor. */}
      <div>
        <label className="block text-[13px] font-medium text-zinc-800 mb-1.5">Parcel size</label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Parcel size">
          {PARCEL_CLASS_OPTIONS.map(opt => {
            const active = parcelClass === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onParcelClassChange(opt.value)}
                className={`text-left rounded-xl px-3.5 py-3 ring-1 transition-colors cursor-pointer ${
                  active ? "ring-zinc-900 bg-zinc-50" : "ring-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <span className="block text-[13.5px] font-medium text-zinc-800">{opt.label}</span>
                <span className="block text-[12.5px] font-medium text-zinc-600 mt-0.5">{opt.weight}</span>
                <span className="block text-[11.5px] text-zinc-400 mt-0.5">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
