import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * `page` lets a wizard spread ONE mounted ProductForm across two steps without
 * splitting its state:
 *   - "listing"  → name, photos, description, tags, category, CTA
 *   - "commerce" → postage/condition, stock, files, links, pricing, license…
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
    expect(screen.queryByText("Pricing")).not.toBeInTheDocument();
    expect(screen.queryByText("Add files")).not.toBeInTheDocument();
  });

  it('page="commerce" shows commerce and hides the listing', () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} page="commerce" />);
    expect(screen.queryByPlaceholderText("Product Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Add description")).not.toBeInTheDocument();
    expect(screen.queryByText("Call to Action Label")).not.toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
    expect(screen.getByText("Add files")).toBeInTheDocument();
  });

  it('default "all" shows both halves — the drawer/admin form is unaffected', () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Product Name")).toBeInTheDocument();
    expect(screen.getByText("Add description")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
    expect(screen.getByText("Add files")).toBeInTheDocument();
  });

  it("the physical commerce page carries condition + parcel inline (not files)", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" page="commerce" />);
    expect(screen.getByLabelText("Condition")).toBeInTheDocument();
    expect(screen.getByText("Parcel size")).toBeInTheDocument();
    // Files are the digital delivery channel — absent on a parcel.
    expect(screen.queryByText("Add files")).not.toBeInTheDocument();
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
