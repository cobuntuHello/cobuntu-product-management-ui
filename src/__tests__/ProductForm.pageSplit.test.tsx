import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * `page` lets a wizard spread ONE mounted ProductForm across two steps without
 * splitting its state:
 *   - "listing"  → name, photos, description, tags, category, CTA
 *   - "commerce" → postage/condition, stock, variants (each carrying its own
 *                  files, links and licence), visibility, approval
 *   - "all"      → everything (the default; drawer + admin single-page form)
 *
 * Only VISIBLE blocks change — onChange still emits the whole payload on either
 * page, which is what makes a single instance safe to page across two steps.
 */

const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };

function lastEmit(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0];
}

describe("page split — listing vs commerce", () => {
  it('page="listing" shows the listing and hides commerce', () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} page="listing" />);
    expect(screen.getByPlaceholderText("Product Name")).toBeInTheDocument();
    expect(screen.getByText("Add description")).toBeInTheDocument();
    expect(screen.getByText("Call to Action Label")).toBeInTheDocument();
    expect(screen.queryByText("Variants")).not.toBeInTheDocument();
    // Deliverables are no longer a product-level row at all - they live inside
    // each variant now - so the commerce half is marked by Variants + approval.
    expect(screen.queryByText("Require approval")).not.toBeInTheDocument();
  });

  it('page="commerce" shows commerce and hides the listing', () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} page="commerce" />);
    expect(screen.queryByPlaceholderText("Product Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Add description")).not.toBeInTheDocument();
    expect(screen.queryByText("Call to Action Label")).not.toBeInTheDocument();
    expect(screen.getByText("Variants")).toBeInTheDocument();
    expect(screen.getByText("Require approval")).toBeInTheDocument();
  });

  it('default "all" shows both halves — the drawer/admin form is unaffected', () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Product Name")).toBeInTheDocument();
    expect(screen.getByText("Add description")).toBeInTheDocument();
    expect(screen.getByText("Variants")).toBeInTheDocument();
    expect(screen.getByText("Require approval")).toBeInTheDocument();
  });

  it("the physical commerce page sends the item's own fields to the variant", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" page="commerce" />);
    // Condition, parcel size and stock are per-VARIANT and the variant editor
    // owns all three - see ProductForm.physicalFields.test.tsx. Files are
    // absent here for EVERY product type now, not just parcels: the digital
    // delivery channel moved inside the variant too, asserted where it now
    // lives, in VariantEditView.deliverables.test.tsx.
    expect(screen.queryByLabelText("Condition")).not.toBeInTheDocument();
    expect(screen.queryByText("Parcel size")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/How many do you have/)).not.toBeInTheDocument();
    expect(screen.queryByText("Add files")).not.toBeInTheDocument();
    // The variants card is still here - that is where they get answered.
    expect(screen.getByText("Variants")).toBeInTheDocument();
  });

  it("emits the full payload even from the commerce page (shared state)", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} page="commerce" />);
    const emit = lastEmit(onChange);
    // The name input is not rendered on the commerce page, yet the payload still
    // carries name + tiers — proof the state is one object, not per-page.
    expect(emit).toHaveProperty("name");
    expect(emit).toHaveProperty("tiers");
  });
});
