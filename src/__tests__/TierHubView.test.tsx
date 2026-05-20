import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TierHubView } from "../components/PriceEditModal/TierHubView";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

/**
 * TierHubView (product) — Level 2 of the 3-level takeover modal.
 *
 * Prop-driven: shows tier-name input + 4 fully-clickable SectionCards.
 * Back / Duplicate / Delete / Save live in the outer modal footer, NOT
 * in this view — so this test surface is minimal: input, summaries,
 * card click → onEnterStep.
 *
 * Product deltas vs events:
 *  - billingSummary handles recurring vs installment vs one-time
 *  - Options summary surfaces installment access months
 *  - Form card uses product copy ("Registration form")
 */

function newTier(overrides: Partial<DraftTier> = {}): DraftTier {
  return {
    ...blankTier({ currency: "EUR", indexHint: 1 }),
    id: "tier-1",
    name: "Pro",
    price: "10",
    currency: "EUR",
    ...overrides,
  };
}

function renderHub(props: Partial<React.ComponentProps<typeof TierHubView>> = {}) {
  return renderWithConfig(
    <TierHubView
      t={newTier()}
      showMemberPricing={false}
      onUpdate={() => {}}
      onEnterStep={() => {}}
      {...props}
    />,
  );
}

describe("TierHubView (product) — landing summary", () => {
  it("renders 3 section cards by default (Basics / Options / Registration form)", () => {
    renderHub();
    expect(screen.getByRole("heading", { name: "Basics", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Options", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Member pricing", level: 3 })).not.toBeInTheDocument();
  });

  it("renders the Member pricing card when showMemberPricing is true", () => {
    renderHub({ showMemberPricing: true });
    expect(screen.getByRole("heading", { name: "Member pricing", level: 3 })).toBeInTheDocument();
  });

  it("Basics summary: price · installment billing summary", () => {
    renderHub({
      t: newTier({ price: "20", installmentEnabled: true, installmentTotal: "60", installmentCount: "3" }),
    });
    expect(screen.getByText(/€20 · Installment plan/)).toBeInTheDocument();
  });

  it("Basics summary: price · recurring billing summary", () => {
    renderHub({
      t: newTier({ price: "10", isRecurring: true, recurringInterval: "monthly" }),
    });
    expect(screen.getByText(/€10 · Recurring · monthly/)).toBeInTheDocument();
  });

  it("Options summary surfaces capacity + pwyw + installment (with access months)", () => {
    renderHub({
      t: newTier({
        capacity: "100",
        priceMode: "pwyw",
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "3",
        installmentInterval: "1",
        installmentAccessMonths: "12",
      }),
    });
    expect(screen.getByText(/Cap: 100/)).toBeInTheDocument();
    expect(screen.getByText(/Pay-what-you-want/)).toBeInTheDocument();
    expect(screen.getByText(/3× over 1 mo, 12mo access/)).toBeInTheDocument();
  });

  it("renders the tier name input as the prominent editor", () => {
    renderHub({ t: newTier({ name: "VIP" }) });
    const nameInput = screen.getByDisplayValue("VIP") as HTMLInputElement;
    expect(nameInput.placeholder).toBe("Standard, VIP, Early-bird…");
  });

  it("calls onUpdate when the tier name changes", async () => {
    const onUpdate = vi.fn();
    renderHub({ onUpdate });
    const nameInput = screen.getByDisplayValue("Pro");
    await userEvent.type(nameInput, "X");
    expect(onUpdate).toHaveBeenCalled();
    expect(onUpdate.mock.calls[0][0].name).toMatch(/^Pro/);
  });

  it("shows the lock banner when sales exist", () => {
    renderHub({ t: newTier({ salesCount: 3 }) });
    expect(screen.getByText(/3 tickets sold/)).toBeInTheDocument();
  });

  it("each SectionCard is fully clickable — clicking the row fires onEnterStep", async () => {
    const onEnterStep = vi.fn();
    renderHub({ onEnterStep });
    await userEvent.click(screen.getByRole("button", { name: /Basics/ }));
    expect(onEnterStep).toHaveBeenCalledWith("basics");
  });

  it("Members + Form cards are disabled (non-button) on unsaved tier", () => {
    renderHub({ t: newTier({ id: undefined }), showMemberPricing: true });
    expect(screen.getByRole("button", { name: /Basics/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Options/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member pricing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registration form/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Member pricing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form" })).toBeInTheDocument();
  });
});
