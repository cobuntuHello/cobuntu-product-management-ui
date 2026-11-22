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
        expect(section).toContain("<MarkdownEditor");
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

    /*
     * "onEditPrice" has left this list: the price row was removed from the
     * card when pricing got its own tab. The point of the test is unchanged --
     * a SHORT field belongs in a row, and only the long-form description was
     * promoted out of one.
     */
    it("leaves the SHORT fields as rows", () => {
        for (const row of ["onEditName", "onEditCta", "onEditTags"]) {
            expect(card).toContain(row);
        }
    });

    it("no longer carries a price row, now that Pricing is a tab", () => {
        expect(card).not.toContain("onEditPrice");
    });
});

describe("it saves itself, and unsaved work survives a refetch", () => {
    it("has no Save button: the shared autosave does the saving", () => {
        /*
         * T-386. A lone Save button sat beside the heading. It made saving a
         * step to remember on a field written in place, and an edit left
         * without pressing it was lost. Behaviour is pinned in
         * DescriptionSection.autosave.test.tsx; this pins the wiring.
         */
        expect(section).not.toContain("disabled={!dirty || saving}");
        expect(section).not.toMatch(/>\s*Save\s*</);
        expect(section).toContain("useAutosave(");
        expect(section).toContain("<AutosaveStatus");
        expect(section).toContain("onBlur={autosave.flush}");
    });

    it("adopts a new server value ONLY when nothing is being typed", () => {
        /*
         * Otherwise a refetch mid-paragraph silently resets the editor to the
         * stored text. With autosave a refetch follows every save, so this
         * matters more now.
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

    it("saves nothing and shows no status when the viewer cannot edit", () => {
        expect(section).toContain("enabled: canEdit,");
        expect(section).toContain("status={canEdit ? <AutosaveStatus");
    });

    it("does not render anything unsafely itself", () => {
        // The USAGE, not the word — the editor component owns its own
        // read-only live-preview overlay internally.
        expect(section).not.toMatch(/dangerouslySetInnerHTML=\{/);
        expect(section).toContain("inert");
    });
});

describe("it saves through the same endpoint the modal used", () => {
    it("PATCHes the product with the description", () => {
        // Moving the surface must not move the contract.
        expect(section).toContain("/api/users/me/products/${productId}");
        expect(section).toMatch(/method:\s*"PATCH"/);
        // `description` is the trimmed text the autosave compares and sends.
        expect(section).toContain("value: content.trim(),");
        expect(section).toContain("description: description || null");
    });
});
