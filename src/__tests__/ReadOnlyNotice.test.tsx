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

    it("shows the seller's own photo when they have one", () => {
        const { container } = render(<ReadOnlyNotice product={{ owner: { id: "u1", name: "Thiago Vieira", profileImage: "https://img/t.jpg" } }} />);
        expect(container.querySelector("img")?.getAttribute("src")).toBe("https://img/t.jpg");
        expect(container.querySelector("svg")).toBeNull();
    });

    it("shows the library avatar the seller was given when they have no photo", () => {
        const { container } = render(<ReadOnlyNotice product={{ owner: { id: "u1", name: "Thiago Vieira", profileImage: null } }} />);
        expect(container.querySelector("img")?.getAttribute("src")).toBe("https://api.cobuntu.com/api/avatars/auto/u1.svg");
    });

    it("keeps the person icon only when there is no seller at all", () => {
        const { container } = render(<ReadOnlyNotice product={{}} />);
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("svg")).toBeTruthy();
    });
});
