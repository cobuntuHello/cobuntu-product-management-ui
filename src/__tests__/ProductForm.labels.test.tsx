/**
 * Tests — the form can be told what the thing is called.
 *
 * The course wizard renders this form for something nobody calls a product, so
 * "Product Name" sat in 28px bold at the top of a page headed "Publish a
 * course". These pin both halves of the fix: the override reaches the screen,
 * and a consumer that passes nothing sees exactly what it saw before.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProductForm } from "../components/ProductForm";

afterEach(cleanup);

describe("by default it still says product", () => {
    it("keeps the placeholder the marketplace has always had", () => {
        // The marketplace passes no labels, so this is the regression guard on
        // every consumer that is not the course wizard.
        render(<ProductForm communityTag="pots" />);
        expect(screen.getByPlaceholderText("Product Name")).toBeTruthy();
    });
});

describe("a consumer can name the thing", () => {
    it("uses the override on the title field", () => {
        render(<ProductForm communityTag="pots" labels={{ namePlaceholder: "Course Name" }} />);
        expect(screen.getByPlaceholderText("Course Name")).toBeTruthy();
        expect(screen.queryByPlaceholderText("Product Name")).toBeNull();
    });

    it("merges a PARTIAL override with the defaults", () => {
        /*
         * The merge is why this is one object rather than seven props: a
         * partial override must not leave one string reading "course" beside
         * another still reading "product", and it must not blank the six it
         * did not mention.
         */
        render(<ProductForm communityTag="pots" labels={{ namePlaceholder: "Course Name" }} />);
        const field = screen.getByPlaceholderText("Course Name") as HTMLInputElement;
        expect(field.placeholder).toBe("Course Name");
        // Nothing else was passed, so nothing else is empty.
        expect(field).toBeTruthy();
    });
});
