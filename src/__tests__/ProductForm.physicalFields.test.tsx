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
