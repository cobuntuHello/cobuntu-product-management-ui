import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemberPricingSection } from "../components/MemberPricingSection";
import type {
  MemberPricingRow,
  MemberPricingTierState,
} from "../components/PriceEditModal/member-pricing";
import { renderWithConfig } from "./test-utils";

/**
 * MemberPricingSection is now a presentational component (state lifted
 * to PriceEditModal in the post-redesign polish pass). These tests
 * exercise its render contract: receives a per-tier state slot + a
 * row-change handler, calls back on user input, surfaces recurringScope
 * row when isRecurringTier=true.
 */

function loadedState(rows: MemberPricingRow[]): MemberPricingTierState {
  return { loading: false, error: null, rows };
}

function makeRow(overrides: Partial<MemberPricingRow> = {}): MemberPricingRow {
  return {
    segmentId: "seg-1",
    segmentName: "VIPs",
    enabled: false,
    mode: "PERCENT_OFF",
    value: "",
    priority: "0",
    recurringScope: "ALWAYS",
    initial: {
      enabled: false,
      mode: "PERCENT_OFF",
      value: "",
      priority: "0",
      recurringScope: "ALWAYS",
    },
    ...overrides,
  };
}

describe("MemberPricingSection (product, presentational)", () => {
  it("renders the loading hint while state.loading is true", () => {
    renderWithConfig(
      <MemberPricingSection
        state={{ loading: true, error: null, rows: [] as never[] }}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.getByText(/Loading member pricing/i)).toBeInTheDocument();
  });

  it("renders the error message when state.error is set", () => {
    renderWithConfig(
      <MemberPricingSection
        state={{ loading: false, error: "Could not load", rows: [] as never[] }}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.getByText(/Could not load/)).toBeInTheDocument();
  });

  it("renders the no-segments empty state when rows is empty", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([])}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.getByText(/No segments configured/i)).toBeInTheDocument();
  });

  it("renders a row per segment", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([
          makeRow({ segmentId: "seg-1", segmentName: "VIPs" }),
          makeRow({ segmentId: "seg-2", segmentName: "Students" }),
        ])}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.getByText("VIPs")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
  });

  it("does not render a Save button (parent modal owns the commit)", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow()])}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /Save/i })).not.toBeInTheDocument();
  });

  it("calls onRowChange when the enable checkbox flips", async () => {
    const onRowChange = vi.fn();
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow({ segmentId: "seg-1", segmentName: "VIPs" })])}
        onRowChange={onRowChange}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    await userEvent.click(screen.getByLabelText(/Offer member pricing for VIPs/));
    expect(onRowChange).toHaveBeenCalledWith(0, { enabled: true });
  });

  it("does NOT render the recurringScope dropdown for one-time tiers", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow({ enabled: true, mode: "PERCENT_OFF", value: "20" })])}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.queryByText(/Every renewal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/First invoice only/)).not.toBeInTheDocument();
  });

  it("renders the recurringScope dropdown when isRecurringTier=true", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow({ enabled: true, mode: "PERCENT_OFF", value: "20" })])}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={true}
      />,
    );
    // The Select displays the current value ("Every renewal" for ALWAYS).
    expect(screen.getByText(/Every renewal/)).toBeInTheDocument();
  });

  it("calls onRowChange with value updates", () => {
    const onRowChange = vi.fn();
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([
          makeRow({ enabled: true, mode: "PERCENT_OFF", value: "10" }),
        ])}
        onRowChange={onRowChange}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    const valueInput = screen.getByPlaceholderText("20") as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: "25" } });
    expect(onRowChange).toHaveBeenCalledWith(0, { value: "25" });
  });

  it("renders 'unsaved' badge when at least one row is dirty", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([
          makeRow({ enabled: true, mode: "PERCENT_OFF", value: "10" }),
        ])}
        onRowChange={() => {}}
        currencySymbol="€"
        isRecurringTier={false}
      />,
    );
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });
});
