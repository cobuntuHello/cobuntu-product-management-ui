import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * Link deliverables on the create form (A6) + the surfaced per-tier
 * "License & usage" section (B9). Emit-assertion style, mirroring
 * ProductForm.physicalFields.test.tsx (the reliable harness).
 */

const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };
function lastEmit(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0];
}

describe("link deliverables on the form", () => {
  it("shows the link row for a digital product, hides it for physical", () => {
    const { rerender } = renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    expect(screen.getByText("Add link deliverables")).toBeInTheDocument();
    rerender(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);
    expect(screen.queryByText("Add link deliverables")).not.toBeInTheDocument();
  });

  it("is suppressed when showLinkDeliverables={false} (the edit drawer's case)", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} showLinkDeliverables={false} />);
    expect(screen.queryByText("Add link deliverables")).not.toBeInTheDocument();
  });

  it("stages an added link into the emitted links[]", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add link deliverables"));
    fireEvent.change(screen.getByPlaceholderText(/^Label/), { target: { value: "Bonus pack" } });
    fireEvent.change(screen.getByPlaceholderText(/^https/), { target: { value: "https://seller.example/bonus" } });
    fireEvent.click(screen.getByRole("button", { name: /add link/i }));
    expect(lastEmit(onChange).links).toEqual([{ label: "Bonus pack", url: "https://seller.example/bonus" }]);
  });

  it("emits an empty links[] for a physical product", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} productType="PHYSICAL" />);
    expect(lastEmit(onChange).links).toEqual([]);
  });
});

describe("License & usage — a row that opens a modal (grouped with the deliverables)", () => {
  it("shows the row for a digital product", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    // Empty state until terms/cap are set.
    expect(screen.getByText("Add license & usage")).toBeInTheDocument();
  });

  it("does not render it for a physical product", () => {
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);
    expect(screen.queryByText(/license & usage/i)).not.toBeInTheDocument();
  });

  it("writes license terms onto the tier and ships that tier (configured predicate)", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);
    // Open the modal, then type — the fields live behind the row now.
    fireEvent.click(screen.getByText("Add license & usage"));
    // The default free Standard tier would normally be dropped at emit; setting
    // a license must make it ship carrying the terms.
    fireEvent.change(
      screen.getByPlaceholderText(/License terms/i),
      { target: { value: "Personal use only. No resale." } },
    );
    const emitted = lastEmit(onChange);
    expect(emitted.tiers.length).toBe(1);
    expect(emitted.tiers[0].licenseTerms).toBe("Personal use only. No resale.");
  });

  it("writes a max-downloads cap onto the tier", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add license & usage"));
    fireEvent.change(screen.getByPlaceholderText("Unlimited"), { target: { value: "5" } });
    const emitted = lastEmit(onChange);
    expect(emitted.tiers.length).toBe(1);
    expect(emitted.tiers[0].maxDownloads).toBe("5");
  });

  it("the row summarises as filled once terms are set", () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add license & usage"));
    fireEvent.change(
      screen.getByPlaceholderText(/License terms/i),
      { target: { value: "Personal use only." } },
    );
    // Row flips from "Add license & usage" to the filled label.
    expect(screen.getAllByText("License & usage").length).toBeGreaterThan(0);
  });
});
