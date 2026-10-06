import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * The variant row surfaces its facts (capacity, files, licence, downloads, stock)
 * so sellers see what's set inside and that the row is editable (feat/variant-row-facts,
 * direction D). Facts render only when present; a bare variant stays a one-liner.
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

describe("ProductForm — variant row facts (direction D)", () => {
  it("shows capacity, files, licence and the Edit cue for a configured variant", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} page="commerce"
        initialData={{ tiers: [tier({ capacity: "20", licenseTerms: "Personal use", maxDownloads: "5", files: [{ name: "guide.pdf" }] })] } as any} />,
    );
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Licence")).toBeInTheDocument();
    expect(screen.getByText("5 max")).toBeInTheDocument();
  });

  it("shows no fact strip for a bare variant (name + price only)", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} page="commerce"
        initialData={{ tiers: [tier()] } as any} />,
    );
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
  });
});
