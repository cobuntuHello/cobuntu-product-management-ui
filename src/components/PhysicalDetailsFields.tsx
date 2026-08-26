"use client";

/**
 * The two questions only a physical item answers.
 *
 * Both are OPTIONAL by design, and that is why they live behind a row rather
 * than sitting open in the form. `condition` stays null when unsaid, because a
 * community selling new merch has no condition to declare and forcing a choice
 * would make every one of them claim "new with tags". `parcelClass` always
 * resolves, to STANDARD, because a postage rate cannot be quoted without one
 * and the seller should not have to think about it. Someone listing a t-shirt
 * can walk past this row and get the right answer to both.
 *
 * The enums mirror services/core/src/shared/listings/physicalListingFields.ts.
 * That normaliser is the authority: it rejects a value outside these lists, and
 * it throws outright if a non-physical product carries either field.
 *
 * Exported as controlled FIELDS, not as a modal. ProductForm wraps them in the
 * same `Dialog` its Tags and Description rows use — a second modal system
 * inside one form is how two of anything start drifting.
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
 * Two classes, not a weight field.
 *
 * A seller does not know what their packed parcel weighs, and asking produces a
 * guess the carrier then corrects at the counter. Two buckets they can answer
 * by looking at the thing is a question they can actually get right.
 */
export const PARCEL_CLASS_OPTIONS: { value: ParcelClassValue; label: string; hint: string }[] = [
  { value: "STANDARD", label: "Standard parcel", hint: "Clothing, shoes, books, accessories. Most things." },
  { value: "HEAVY", label: "Large or heavy", hint: "A rug, a chair, a console. Costs more to post." },
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
  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-[13px] font-medium text-zinc-800 mb-2">Condition</legend>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Condition">
          {/*
            * "Not specified" is a listed option, not the absence of one.
            *
            * Leaving every button unselected reads as an unanswered question
            * the form is waiting on. Naming the empty answer, and saying who it
            * is for, turns it into a choice a shop can deliberately make.
            */}
          <ChoiceRow
            active={condition === null}
            label="Not specified"
            hint="For new stock sold by a shop, where condition does not apply"
            onSelect={() => onConditionChange(null)}
          />
          {CONDITION_OPTIONS.map(opt => (
            <ChoiceRow
              key={opt.value}
              active={condition === opt.value}
              label={opt.label}
              hint={opt.hint}
              onSelect={() => onConditionChange(opt.value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-medium text-zinc-800 mb-2">Parcel size</legend>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Parcel size">
          {PARCEL_CLASS_OPTIONS.map(opt => (
            <ChoiceRow
              key={opt.value}
              active={parcelClass === opt.value}
              label={opt.label}
              hint={opt.hint}
              onSelect={() => onParcelClassChange(opt.value)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ChoiceRow(
  { active, label, hint, onSelect }: { active: boolean; label: string; hint: string; onSelect: () => void },
) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`w-full text-left rounded-xl px-3.5 py-2.5 transition-colors cursor-pointer ring-1 ${
        active ? "ring-zinc-900 bg-zinc-50" : "ring-zinc-200 hover:bg-zinc-50"
      }`}
    >
      <span className="block text-[13.5px] font-medium text-zinc-800">{label}</span>
      <span className="block text-[12.5px] text-zinc-500 mt-0.5">{hint}</span>
    </button>
  );
}
