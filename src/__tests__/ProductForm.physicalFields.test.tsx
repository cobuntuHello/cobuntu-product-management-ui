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

describe("the physical row only exists where the fields do", () => {
  it("renders no row for a digital product", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.queryByText("Postage and condition")).not.toBeInTheDocument();
  });

  it("renders no row for a course either", () => {
    // A course is not posted. Same absence, different reason.
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="COURSE" />);
    expect(screen.queryByText("Postage and condition")).not.toBeInTheDocument();
  });

  it("renders the row for a physical product", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);
    expect(screen.getByText("Postage and condition")).toBeInTheDocument();
  });

  it("summarises an untouched row as a real answer, not an empty one", () => {
    /*
     * Parcel size is STANDARD until someone says otherwise, so this row is
     * never in the "nothing chosen yet" state the other rows show. Condition
     * is absent from the summary because it is genuinely unset.
     */
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);
    expect(screen.getByText("Standard parcel")).toBeInTheDocument();
  });
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

  it("emits what the seller chose", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);

    fireEvent.click(screen.getByText("Postage and condition"));
    fireEvent.click(screen.getByText("Good"));
    fireEvent.click(screen.getByText("Large or heavy"));

    expect(lastEmit(onChange).condition).toBe("GOOD");
    expect(lastEmit(onChange).parcelClass).toBe("HEAVY");
  });

  it("lets the seller go back to saying nothing about condition", () => {
    // Not-specified is a choice, so it has to be reachable after picking one.
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);

    fireEvent.click(screen.getByText("Postage and condition"));
    fireEvent.click(screen.getByText("Good"));
    expect(lastEmit(onChange).condition).toBe("GOOD");

    fireEvent.click(screen.getByText("Not specified"));
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
    expect(screen.getByText("Very good · Large or heavy")).toBeInTheDocument();
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
    const { rerender } = renderWithConfig(
      <ProductForm {...base} onChange={onChange} productType="PHYSICAL" />,
    );

    fireEvent.click(screen.getByText("Postage and condition"));
    fireEvent.click(screen.getByText("Good"));
    fireEvent.click(screen.getByText("Large or heavy"));
    expect(lastEmit(onChange).condition).toBe("GOOD");

    rerender(<ProductForm {...base} onChange={onChange} productType="DIGITAL" />);

    expect(lastEmit(onChange).condition).toBeNull();
    expect(lastEmit(onChange).parcelClass).toBeNull();
    expect(screen.queryByText("Postage and condition")).not.toBeInTheDocument();
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
  it("asks how many only for a physical product", () => {
    const { rerender } = renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />,
    );
    expect(screen.getByLabelText(/How many do you have/)).toBeInTheDocument();

    rerender(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/How many do you have/)).not.toBeInTheDocument();
  });

  it("emits no tier at all when the quantity is blank", () => {
    // Blank means unlimited, which is the honest reading of "no capacity row".
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);
    expect(lastEmit(onChange).tiers).toEqual([]);
  });

  it("puts the number on a tier, because that is where stock lives", () => {
    /*
     * There is no products.stockQuantity and deliberately will not be. Stock
     * is product_tiers.capacity, row-locked and derived from seat-holding
     * sales, so a refund frees its unit with no counter that can drift.
     *
     * The seller types one number and never meets the word "tier".
     */
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);

    fireEvent.change(screen.getByLabelText(/How many do you have/), { target: { value: "3" } });

    const tiers = lastEmit(onChange).tiers;
    expect(tiers).toHaveLength(1);
    expect(tiers[0].capacity).toBe("3");
  });

  it("keeps a zero, because on a live product that means sold out", () => {
    // This form edits as well as creates. Silently clearing 0 to "unlimited"
    // would put a sold-out listing back on sale.
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);

    fireEvent.change(screen.getByLabelText(/How many do you have/), { target: { value: "0" } });
    expect(lastEmit(onChange).tiers[0].capacity).toBe("0");
  });

  it("refuses anything that is not a number", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);
    const input = screen.getByLabelText(/How many do you have/) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "12x" } });
    expect(input.value).toBe("12");

    fireEvent.change(input, { target: { value: "007" } });
    expect(input.value).toBe("7");
  });
});

describe("the digital delivery channel does not follow a parcel", () => {
  it("hides Add files for a physical product", () => {
    /*
     * productFiles is DELIVERY, not description: attachments land in a private
     * bucket and are handed over on purchase. The label does not say so, so a
     * seller could attach a care guide believing it is a description.
     */
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);
    expect(screen.queryByText("Add files")).not.toBeInTheDocument();
  });

  it("still offers it for a digital product", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.getByText("Add files")).toBeInTheDocument();
  });

  it("DROPS files already attached when the type becomes physical", () => {
    /*
     * The worst version of this bug: attach a file, switch to Physical, and
     * without the emit rule the parcel seller also ships a download they had
     * stopped being able to see. Nothing on screen would have shown it.
     *
     * Emptied on EMIT, not cleared from state, so switching back brings them.
     */
    const onChange = vi.fn();
    const seeded = { productFiles: [{ id: "f1", name: "guide.pdf", size: 10, type: "application/pdf", url: "u", isExisting: true }] } as any;

    const { rerender } = renderWithConfig(
      <ProductForm {...base} onChange={onChange} initialData={seeded} />,
    );
    expect(lastEmit(onChange).productFiles).toHaveLength(1);

    rerender(<ProductForm {...base} onChange={onChange} initialData={seeded} productType="PHYSICAL" />);
    expect(lastEmit(onChange).productFiles).toEqual([]);

    rerender(<ProductForm {...base} onChange={onChange} initialData={seeded} />);
    expect(lastEmit(onChange).productFiles).toHaveLength(1);
  });
});
