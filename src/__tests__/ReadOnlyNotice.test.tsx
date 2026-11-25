/**
 * The note a community sees on a product it carries but does not own
 * (ProductManagePage's ReadOnlyNotice).
 *
 * Seen live on 24 Nov 2026: it was amber with `dark:` variants, so on a light
 * admin page viewed from a dark-mode system it drew as a brown box with yellow
 * text, and its copy carried an em dash (house rule: none in customer copy).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadOnlyNotice } from "../page/ProductManagePage";

describe("the read-only notice", () => {
    it("names the seller and says where the product itself is changed", () => {
        render(<ReadOnlyNotice product={{ owner: { name: "Thiago Vieira" } }} />);
        expect(screen.getByText("Thiago Vieira sells this")).toBeTruthy();
        expect(screen.getByRole("note").textContent).toContain("ask Thiago in the listing conversation");
    });

    it("has no em dash and no dark-mode variant that could turn it brown on a light page", () => {
        const { container } = render(<ReadOnlyNotice product={{ owner: { name: "Thiago Vieira" } }} />);
        const note = container.querySelector('[role="note"]') as HTMLElement;
        expect(note.textContent).not.toContain("—");
        expect(container.innerHTML).not.toMatch(/dark:/);
        expect(note.className).not.toMatch(/amber/);
    });

    it("still reads without a seller name", () => {
        render(<ReadOnlyNotice product={{}} />);
        expect(screen.getByText("This product belongs to its seller")).toBeTruthy();
        expect(screen.getByRole("note").textContent).toContain("ask the seller in the listing conversation");
    });
});
