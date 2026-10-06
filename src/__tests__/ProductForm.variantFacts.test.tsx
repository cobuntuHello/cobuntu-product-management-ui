import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * The variant row surfaces its facts so sellers discover what's editable inside
 * (feat/variant-facts-discoverable). Curated-always, rest when-set: the core
 * properties (Capacity, Files, Licence, Sign-up form) show even when UNSET —
 * "Capacity: Unlimited", "Sign-up form: Not set" — so buyers learn the knob
 * exists; niche ones (Downloads, Attributes) only appear once set. Digital-only
 * facts (Files/Licence) drop on a physical product.
 */
const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };

const tier = (over: Record<string, unknown> = {}) => ({
  localId: "t1", name: "Standard", description: "", licenseTerms: "", maxDownloads: "",
  price: "", currency: "EUR", capacity: "", isRecurring: false, recurringInterval: "monthly",
  hasForm: false, formFieldCount: 0, salesCount: 0, priceMode: "fixed", pwywMin: "",
  installmentEnabled: false, installmentTotal: "", installmentCount: "", installmentInterval: "",
  installmentAccessMonths: "", expanded: false, publishedAt: null, autoScheduleEnabled: false,
  salesStartAt: "", salesEndAt: "", files: [], links: [], attrs: [],
  ...over,
});

describe("ProductForm — variant row facts (curated-always)", () => {
  it("shows the configured values for a fully-set digital variant", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} page="commerce"
        initialData={{ tiers: [tier({ capacity: "20", licenseTerms: "Personal use", maxDownloads: "5", formFieldCount: 3, files: [{ name: "guide.pdf" }] })] } as any} />,
    );
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Licence")).toBeInTheDocument();
    expect(screen.getByText("Set")).toBeInTheDocument();
    expect(screen.getByText("5 max")).toBeInTheDocument();
    expect(screen.getByText("Sign-up form")).toBeInTheDocument();
    expect(screen.getByText("3 questions")).toBeInTheDocument();
  });

  it("still shows the curated facts (with unset values) for a bare digital variant", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} page="commerce"
        initialData={{ tiers: [tier()] } as any} />,
    );
    // The whole point: unset knobs are still advertised so sellers discover them.
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("Licence")).toBeInTheDocument();
    expect(screen.getByText("Sign-up form")).toBeInTheDocument();
    // Both Licence and Sign-up form read "Not set" when unset.
    expect(screen.getAllByText("Not set")).toHaveLength(2);
    // Niche facts stay hidden until set.
    expect(screen.queryByText("Downloads")).not.toBeInTheDocument();
    expect(screen.queryByText("Attributes")).not.toBeInTheDocument();
  });

  it("drops the digital-only facts (Files, Licence) on a physical product", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} page="commerce" productType="PHYSICAL"
        initialData={{ tiers: [tier({ capacity: "10", condition: "New", parcelSize: "Small" })] } as any} />,
    );
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
    expect(screen.queryByText("Licence")).not.toBeInTheDocument();
    // Physical-shape facts show when set.
    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Postage")).toBeInTheDocument();
    expect(screen.getByText("Small")).toBeInTheDocument();
    expect(screen.getByText("Sign-up form")).toBeInTheDocument();
  });
});
