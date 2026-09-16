import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * "Can be bought more than once", and the state that is neither on nor off.
 *
 * The column behind this switch is NULLABLE on purpose: true and false are the
 * seller speaking, and NULL is the seller having said nothing, which the
 * backend resolves from the listing itself (a course or a digital product with
 * files cannot be re-bought; anything else can).
 *
 * So an UNTOUCHED switch must emit nothing at all. If it emitted the value it
 * happens to be showing, then merely opening the form on any product would
 * freeze that product's derivation for ever, and a listing that later gained
 * its first downloadable file would go on offering itself for a second sale.
 *
 * That is the whole test. The rest is making sure the switch still shows the
 * truth while staying silent.
 */

const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };

/** The last payload the form emitted, or null if it never emitted one. */
function lastEmit(onChange: ReturnType<typeof vi.fn>) {
    const calls = onChange.mock.calls;
    return calls.length ? calls[calls.length - 1][0] : null;
}

describe("the repeat-purchase switch", () => {
    it("has its own card, separate from Approval", () => {
        const onChange = vi.fn();
        renderWithConfig(<ProductForm {...base} onChange={onChange} />);
        expect(screen.getByText("Purchases")).toBeInTheDocument();
        expect(screen.getByText("Can be bought more than once")).toBeInTheDocument();
    });

    it("survives hideApproval, because the two rules are unrelated", () => {
        const onChange = vi.fn();
        renderWithConfig(<ProductForm {...base} onChange={onChange} hideApproval />);
        expect(screen.queryByText("Approval")).not.toBeInTheDocument();
        expect(screen.getByText("Can be bought more than once")).toBeInTheDocument();
    });

    it("emits NOTHING while the seller has not touched it", () => {
        const onChange = vi.fn();
        renderWithConfig(<ProductForm {...base} onChange={onChange} />);
        const payload = lastEmit(onChange);
        expect(payload).not.toBeNull();
        // Not `toBeUndefined()`: the key must be ABSENT, so the backend leaves
        // the column NULL rather than recording an answer nobody gave.
        expect("allowRepeatPurchase" in payload).toBe(false);
    });

    it("still emits nothing when it is only SHOWING the backend's resolved value", () => {
        const onChange = vi.fn();
        renderWithConfig(
            <ProductForm
                {...base}
                onChange={onChange}
                initialData={{ canRepeatPurchase: false } as any}
            />,
        );
        // Showing "off" because the backend derived it, not because anyone
        // chose it. This is the case that would silently write false.
        const payload = lastEmit(onChange);
        expect("allowRepeatPurchase" in payload).toBe(false);
    });

    it("emits the seller's answer once they touch it", () => {
        const onChange = vi.fn();
        renderWithConfig(<ProductForm {...base} onChange={onChange} />);
        fireEvent.click(screen.getByText("Can be bought more than once"));
        expect(lastEmit(onChange).allowRepeatPurchase).toBe(false);
    });

    it("carries an existing NO through as an answer, not as silence", () => {
        const onChange = vi.fn();
        renderWithConfig(
            <ProductForm
                {...base}
                onChange={onChange}
                initialData={{ allowRepeatPurchase: false } as any}
            />,
        );
        /*
         * The `||` trap. An existing false is falsy, so seeding with `||`
         * would read a seller's deliberate "no" as "untouched" and drop it
         * from the payload, quietly reverting them to the derived behaviour.
         */
        expect(lastEmit(onChange).allowRepeatPurchase).toBe(false);
    });

    it("shows the seller's answer in preference to the resolved one", () => {
        const onChange = vi.fn();
        renderWithConfig(
            <ProductForm
                {...base}
                onChange={onChange}
                initialData={{ allowRepeatPurchase: true, canRepeatPurchase: false } as any}
            />,
        );
        // One click from a shown "on" must produce "off", which only holds if
        // the switch was showing the seller's true rather than the derived
        // false.
        fireEvent.click(screen.getByText("Can be bought more than once"));
        expect(lastEmit(onChange).allowRepeatPurchase).toBe(false);
    });
});
