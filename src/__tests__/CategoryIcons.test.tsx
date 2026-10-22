import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CategoryIcon } from "../components/CategoryPickerRow";

/**
 * Categories show their own icon (T-270 item 3).
 *
 * CategoryPickerRow already DECLARED iconId/iconColor/imageUrl on both option
 * types and its header comment said sub-categories carry them -- but iconId
 * appeared only in those types, never in the markup, so every chip rendered
 * its name alone.
 *
 * The same change landed in event-management-ui, whose copy of this file is
 * byte-identical apart from one comment line.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

describe("the category icon", () => {
  it("renders the photo when the category has one", () => {
    const { container } = render(
      <CategoryIcon iconId="mdi:tag" iconColor="#ff0000" imageUrl="https://img/x.png" />,
    );
    expect(container.querySelector("img")!.getAttribute("src")).toBe("https://img/x.png");
  });

  it("renders the glyph on the category's own colour", () => {
    const { container } = render(<CategoryIcon iconId="mdi:tag" iconColor="#00ff00" imageUrl={null} />);
    const disc = container.querySelector("span")!;
    expect(disc.getAttribute("style")).toContain("#00ff00");
  });

  /*
   * No fallback glyph. 57/60 product categories and 80/80 sub-categories carry
   * an iconId, so a stand-in would be the exception in costume, and a generic
   * icon repeated down a row of chips makes the real ones harder to read.
   */
  it("renders nothing when the category has no icon", () => {
    const { container } = render(<CategoryIcon iconId={null} iconColor={null} imageUrl={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("is decorative, so it is not announced beside the name", () => {
    render(<CategoryIcon iconId="mdi:tag" iconColor={null} imageUrl={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  /* Same library the admin's Manage Categories tile and this package's own
     CategoryEditModal already use. A sibling drawing the same icons a second
     way is a difference somebody has to discover later. */
  it("uses @iconify/react, like the rest of this package", () => {
    const src = read("components/CategoryPickerRow.tsx");
    expect(src).toContain('from "@iconify/react"');
    expect((src.match(/<CategoryIcon/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
