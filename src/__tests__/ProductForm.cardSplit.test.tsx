import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";
import { ProductSettingsDrawer } from "../page/ProductSettingsDrawer";

/**
 * Product Options was one card holding three unrelated things: the price
 * tiers, the two community-only gates, and the seller's own approval switch.
 *
 * For a member seller `hideVisibility` dropped the middle two where they
 * stood, so the card showed holes with nothing explaining them. Grouping
 * turns two missing features into one legible rule about ownership.
 *
 * Mirrors cobuntu-event-management-ui's EventForm.cardSplit.test.tsx.
 */

const base = { communityTag: "acme", onChange: vi.fn(), showTiers: true, categories: [] as any[] };

describe("ProductForm groups options by who the setting belongs to", () => {
  it("gives the community-only gates their own labelled card", () => {
    renderWithConfig(<ProductForm {...base} />);
    expect(screen.getByText("Community access")).toBeInTheDocument();
    expect(screen.getByText(/owns this product/)).toBeInTheDocument();
  });

  it("drops the whole card, heading and all, for a member seller", () => {
    // The heading must not outlive the rows it introduces.
    renderWithConfig(<ProductForm {...base} hideVisibility />);
    expect(screen.queryByText("Community access")).not.toBeInTheDocument();
    expect(screen.queryByText(/owns this product/)).not.toBeInTheDocument();
  });

  it("keeps Approval for a member seller", () => {
    /*
     * requiresApproval is outside COMMUNITY_SCOPED_PRODUCT_FIELDS, so the
     * backend allows it on a personal product. Grouping it with the community
     * settings would take it from exactly the people it belongs to.
     */
    renderWithConfig(<ProductForm {...base} hideVisibility />);
    expect(screen.getByText("Approval")).toBeInTheDocument();
    expect(screen.getByText("Require approval")).toBeInTheDocument();
  });

  it("leaves the Pricing card without an eyebrow", () => {
    // That label was removed deliberately on 2026-08-09; the split adds
    // headings to the NEW groups without reverting that decision.
    const src = readFileSync(resolve(__dirname, "../components/ProductForm.tsx"), "utf8");
    expect(src).toContain("removed\n              deliberately on 2026-08-09");
  });
});

describe("ProductSettingsDrawer groups the same way", () => {
  const drawer = (product: any) =>
    renderWithConfig(
      <ProductSettingsDrawer
        product={product}
        communityTag="acme"
        productId="p1"
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
        showToast={vi.fn()}
        requiresApproval={false}
        onSaveApproval={vi.fn()}
      />,
    );

  it("labels both groups on a community product", () => {
    drawer({ id: "p1", communityId: "c1", viewability: "PUBLIC", accessibility: "PUBLIC" });
    expect(screen.getByText("Community access")).toBeInTheDocument();
    expect(screen.getByText("Your settings")).toBeInTheDocument();
  });

  it("drops the community heading with its rows on a personal product", () => {
    drawer({ id: "p1", communityId: null, viewability: "PUBLIC", accessibility: "PUBLIC" });
    expect(screen.queryByText("Community access")).not.toBeInTheDocument();
    expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
    expect(screen.getByText("Your settings")).toBeInTheDocument();
  });
});
