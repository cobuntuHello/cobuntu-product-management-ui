import { describe, it, expect, vi } from "vitest";
import { ProductForm } from "../components/ProductForm";
import { renderWithConfig } from "./test-utils";
import { blankTier } from "../components/PriceEditModal/helpers";

vi.mock("react-quill-new", () => ({ default: () => null }));

/**
 * A free tier's configuration has to survive submit.
 *
 * The form used to emit `tiers: paid ? named : []`, so a tier at price 0
 * carrying a 50-person capacity and a registration form emitted ZERO tiers and
 * both were discarded. "Free product, 50 seats, with an application form" was
 * configurable and unsavable — and silently so, because the tier looked
 * perfectly fine in the Pricing card right up to the moment it was dropped.
 *
 * The split these tests protect: `isPaid` stays strictly PRICE-derived, since
 * it gates Stripe and the Submit button, while whether to SEND tiers depends
 * on whether the seller configured anything. Collapsing the two back together
 * is what caused the bug, and it would be an easy thing to "tidy up".
 */

const tier = (o: Record<string, unknown> = {}) => ({
  ...blankTier({ currency: "USD" }), name: "Standard", ...o,
});

function emit(tiers: unknown[]) {
  const onChange = vi.fn();
  renderWithConfig(
    <ProductForm
      communityTag="orbis"
      showTiers
      onChange={onChange}
      initialData={{
        name: "P", description: "", tags: [], mediaItems: [], productFiles: [],
        isPaid: false, price: "", currency: "USD", isRecurring: false,
        recurringInterval: "monthly", ctaText: "", tiers,
      } as any}
    />,
  );
  return onChange.mock.calls.at(-1)?.[0];
}

describe("ProductForm — free tiers that carry configuration", () => {
  it("submits a free tier that caps supply", () => {
    // The headline case. Capacity is the whole reason to have a free tier.
    const d = emit([tier({ price: "0", capacity: "50" })]);

    expect(d.tiers).toHaveLength(1);
    expect(d.tiers[0].capacity).toBe("50");
  });

  it("submits a free tier that asks questions", () => {
    const d = emit([tier({
      price: "0",
      draftForm: { fields: [{ id: "q1", label: "Why do you want this?", type: "text" }] },
    })]);

    expect(d.tiers).toHaveLength(1);
    expect(d.tiers[0].draftForm.fields).toHaveLength(1);
  });

  it("submits a free tier the seller named themselves", () => {
    // A deliberate name is configuration too — "Members" is a decision,
    // "Standard" is just what the seed was called.
    const d = emit([tier({ name: "Members", price: "0" })]);

    expect(d.tiers).toHaveLength(1);
    expect(d.tiers[0].name).toBe("Members");
  });

  it("does NOT submit an untouched seed tier", () => {
    // A plain free product must stay exactly as it was: price 0, no tiers.
    const d = emit([tier({ price: "0" })]);

    expect(d.tiers).toEqual([]);
  });

  it("keeps isPaid false for every free tier, however configured", () => {
    // isPaid gates Stripe and disables Submit. If a free-but-configured tier
    // flipped it true, a seller with no Stripe account could no longer publish
    // a free product — turning a data fix into an access regression.
    expect(emit([tier({ price: "0", capacity: "50" })]).isPaid).toBe(false);
    expect(emit([tier({ name: "Members", price: "0" })]).isPaid).toBe(false);
    expect(emit([tier({
      price: "0", draftForm: { fields: [{ id: "q", label: "?", type: "text" }] },
    })]).isPaid).toBe(false);
  });

  it("still reports isPaid for a charging tier", () => {
    expect(emit([tier({ price: "25" })]).isPaid).toBe(true);
    expect(emit([tier({ price: "0", priceMode: "pwyw" })]).isPaid).toBe(true);
  });

  it("submits the whole set when any tier is configured", () => {
    // Tiers are submitted as a set; a paid tier alongside a free one must not
    // drop the free one, or the buyer loses an option the seller created.
    const d = emit([tier({ name: "Free", price: "0" }), tier({ name: "Pro", price: "25" })]);

    expect(d.tiers).toHaveLength(2);
  });
});
