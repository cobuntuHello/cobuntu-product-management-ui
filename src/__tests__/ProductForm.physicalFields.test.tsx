import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * `condition` and `parcelClass` exist only on a physical product, and the
 * backend does not treat that as a preference.
 *
 * normalisePhysicalFields (services/core/src/shared/listings/
 * physicalListingFields.ts) THROWS a ValidationError when a digital product
 * arrives carrying either field, deliberately, so that a caller cannot ship
 * believing it set something that was quietly dropped. That makes "what does
 * this form emit for a non-physical product" a correctness question rather
 * than a tidiness one: emit a stale value and the create 400s.
 *
 * The last test here is the one that matters most, because it covers the only
 * way a stale value can actually reach the wire.
 */

const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };

/** The most recent onChange payload — the form emits on every edit. */
function lastEmit(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0];
}

describe("the product form does not ask per-variant questions", () => {
  /*
   * Condition, parcel size and stock are properties of a single VARIANT, not of
   * the product: a variant owns its own `products` row (product_tiers.productId
   * is unique) carrying condition / parcelClass / shippingPrice, and its stock
   * is product_tiers.capacity. The variant editor asks for all three, the
   * buyer's detail page describes the SELECTED variant, and checkout charges
   * postage off `selectedTier.products.shippingPrice`.
   *
   * They used to render on the form for the single-variant case. That escape
   * hatch is gone: the redesigned form always seeds a variant, so there is no
   * shape left where the parent row is the thing being bought. Left on the form
   * they were a second control writing a row nobody reads, and a seller who set
   * a condition here watched the variant keep its own.
   */
  const shapes = [
    ["a digital product", {}],
    ["a course", { productType: "COURSE" as const }],
    ["a physical product", { productType: "PHYSICAL" as const }],
  ] as const;

  for (const [label, props] of shapes) {
    it(`asks nothing about condition, parcel or stock on ${label}`, () => {
      renderWithConfig(<ProductForm {...base} {...(props as any)} onChange={vi.fn()} />);
      expect(screen.queryByLabelText("Condition")).not.toBeInTheDocument();
      expect(screen.queryByText("Parcel size")).not.toBeInTheDocument();
      expect(screen.queryByText("Postage & condition")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/How many do you have/)).not.toBeInTheDocument();
    });
  }
});

describe("what the form emits", () => {
  it("emits null for both on a digital product", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);
    expect(lastEmit(onChange).condition).toBeNull();
    expect(lastEmit(onChange).parcelClass).toBeNull();
  });

  it("emits the default parcel class on a physical product with nothing touched", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);
    expect(lastEmit(onChange).parcelClass).toBe("STANDARD");
    // Unsaid stays unsaid. A shop selling new merch declares no condition.
    expect(lastEmit(onChange).condition).toBeNull();
  });

  it("seeds from initialData, so a resumed draft reopens on what was saved", () => {
    const onChange = vi.fn();
    renderWithConfig(
      <ProductForm
        {...base}
        onChange={onChange}
        productType="PHYSICAL"
        initialData={{ condition: "VERY_GOOD", parcelClass: "HEAVY" } as any}
      />,
    );
    expect(lastEmit(onChange).condition).toBe("VERY_GOOD");
    expect(lastEmit(onChange).parcelClass).toBe("HEAVY");
  });

  it("NULLS a value the seller set before switching away from physical", () => {
    /*
     * THE ONE THAT MATTERS.
     *
     * The create wizard's type step and this form are both live at once: the
     * seller can pick Physical, answer these questions, then step back and
     * switch to Digital. The answers stay in this form's state, because the
     * form is deliberately kept mounted across wizard steps so nothing else is
     * lost either.
     *
     * If the emit passed those retained values straight through, the create
     * would send `condition` on a DIGITAL product and normalisePhysicalFields
     * would throw. The seller would see a failed create with an error about a
     * field they cannot see, on a screen with no way to clear it.
     *
     * Nulling on emit rather than clearing the state is what makes the switch
     * survivable in both directions: step back to Physical and the answers are
     * still there.
     */
    const onChange = vi.fn();
    const seeded = { condition: "GOOD", parcelClass: "HEAVY" } as any;
    const { rerender } = renderWithConfig(
      <ProductForm {...base} onChange={onChange} productType="PHYSICAL" initialData={seeded} />,
    );
    expect(lastEmit(onChange).condition).toBe("GOOD");

    rerender(<ProductForm {...base} onChange={onChange} productType="DIGITAL" initialData={seeded} />);

    expect(lastEmit(onChange).condition).toBeNull();
    expect(lastEmit(onChange).parcelClass).toBeNull();
    expect(screen.queryByText("Parcel size")).not.toBeInTheDocument();
  });
});

/**
 * Stock, and the digital delivery channel that must not follow a parcel.
 *
 * Both are the same shape of bug as `condition`: state that stays behind when
 * the seller changes their mind about what they are selling, and is then sent
 * anyway. The difference is what it costs. A stale `condition` is a failed
 * create with a visible error. A stale FILE is a successful create that hands
 * the buyer a download the seller thought they had removed.
 */
describe("stock", () => {
  it("emits no tier at all when nothing seeded one", () => {
    // Blank means unlimited, which is the honest reading of "no capacity row".
    // The form no longer writes capacity itself - the variant editor does.
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);
    expect(lastEmit(onChange).tiers).toEqual([]);
  });
});

describe("the digital delivery channel does not follow a parcel", () => {
  it("offers no product-level file row at all any more", () => {
    /*
     * Files are DELIVERY, not description: attachments land in a private
     * bucket and are handed over on purchase. The label did not say so, so a
     * seller could attach a care guide believing it was a description.
     *
     * That row is now gone from the product entirely - for every type, not
     * just parcels - because deliverables belong to a variant. What replaced
     * the physical-specific half of the rule is the emit guard below.
     */
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);
    expect(screen.queryByText("Add files")).not.toBeInTheDocument();
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.queryByText("Add files")).not.toBeInTheDocument();
  });

  it("DROPS a VARIANT's files and links when the type becomes physical", () => {
    /*
     * The worst version of this bug: attach a file, switch to Physical, and
     * without the emit rule the parcel seller also ships a download they had
     * stopped being able to see. Nothing on screen would have shown it.
     *
     * The per-variant redesign moved deliverables from the product onto each
     * variant, and this guarantee did NOT move with them: files and links
     * survived the switch. It is restored here, at the level they now live at.
     *
     * Emptied on EMIT, not cleared from state, so switching back brings them.
     */
    const onChange = vi.fn();
    const seeded = {
      tiers: [{
        localId: "a", name: "Small", description: "", price: "10",
        currency: "EUR", capacity: "", priceMode: "fixed",
        files: [{ id: "f1", name: "guide.pdf", url: "u" }],
        links: ["https://example.test/extras"],
      }],
    } as any;

    const { rerender } = renderWithConfig(
      <ProductForm {...base} onChange={onChange} initialData={seeded} />,
    );
    expect(lastEmit(onChange).tiers[0].files).toHaveLength(1);
    expect(lastEmit(onChange).tiers[0].links).toHaveLength(1);

    rerender(<ProductForm {...base} onChange={onChange} initialData={seeded} productType="PHYSICAL" />);
    expect(lastEmit(onChange).tiers[0].files).toEqual([]);
    expect(lastEmit(onChange).tiers[0].links).toEqual([]);

    // Back to digital: the seller gets their deliverables back, because the
    // rule is applied on emit and never touches the form's own state.
    rerender(<ProductForm {...base} onChange={onChange} initialData={seeded} />);
    expect(lastEmit(onChange).tiers[0].files).toHaveLength(1);
    expect(lastEmit(onChange).tiers[0].links).toHaveLength(1);
  });
});
