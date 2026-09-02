import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The product description is read and edited in place.
 *
 * The same client feedback that moved the EVENT description out of a truncated
 * row: the short fields — a name, a price, a category — fit in a compact row
 * completely, so a row is right for them. A description is paragraphs, so a
 * one-line row showed almost nothing and amounted to a permanent instruction
 * to click.
 *
 * Applied here for consistency: a seller managing a product and a host
 * managing an event should not meet two different answers to the same
 * question.
 */

const section = readFileSync(resolve(__dirname, "../page/sections/DescriptionSection.tsx"), "utf8");
const details = readFileSync(resolve(__dirname, "../page/views/DetailsView.tsx"), "utf8");
const card = readFileSync(resolve(__dirname, "../page/sections/ProductCard.tsx"), "utf8");

describe("the description has its own section", () => {
    it("renders below the card", () => {
        expect(details).toContain("<DescriptionSection");
    });

    it("edits inline rather than opening a modal", () => {
        expect(section).toContain("<RichTextEditor");
        expect(details).not.toContain('modal === "description"');
    });

    it("no longer offers a truncated row to click", () => {
        // Leaving it would give two ways to edit one field, and its truncation
        // is what was objected to.
        expect(card).not.toContain("onEditDescription");
        expect(details).not.toContain("onEditDescription");
    });

    it("drops 'description' from the modal union", () => {
        expect(details).not.toMatch(/ProductModal = [^;]*"description"/);
    });

    it("leaves the SHORT fields as rows", () => {
        for (const row of ["onEditName", "onEditPrice", "onEditCta", "onEditTags"]) {
            expect(card).toContain(row);
        }
    });
});

describe("unsaved work is visible and survives a refetch", () => {
    it("only enables Save once the content differs", () => {
        expect(section).toContain("const dirty = content !== saved;");
        expect(section).toContain("disabled={!dirty || saving}");
    });

    it("adopts a new server value ONLY when nothing is being typed", () => {
        /*
         * Otherwise a refetch mid-paragraph silently resets the editor to the
         * stored text.
         */
        expect(section).toContain("const seededFrom = useRef(saved);");
        expect(section).toContain("prev === seededFrom.current ? saved : prev");
    });
});

describe("permissions and read-only", () => {
    it("uses the view's own permission hook, not a prop", () => {
        expect(section).toContain('from "../../lib/manageAccess"');
        expect(section).toContain("const canEdit = useCanEdit();");
    });

    it("hides Save entirely when the viewer cannot edit", () => {
        expect(section).toContain("{canEdit && (");
    });

    it("does not re-render stored HTML itself", () => {
        // The USAGE, not the word — the comment above it explains why we do
        // not do this.
        expect(section).not.toMatch(/dangerouslySetInnerHTML=\{/);
        expect(section).toContain("inert");
    });
});

describe("it saves through the same endpoint the modal used", () => {
    it("PATCHes the product with the description", () => {
        // Moving the surface must not move the contract.
        expect(section).toContain("/api/users/me/products/${productId}");
        expect(section).toMatch(/method:\s*"PATCH"/);
        expect(section).toContain("description: content.trim() || null");
    });
});
