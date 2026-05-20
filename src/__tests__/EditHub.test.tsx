import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditHub } from "../components/PriceEditModal/EditHub";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

function newTier(overrides: Partial<DraftTier> = {}): DraftTier {
  return {
    ...blankTier(),
    id: "tier-1",
    name: "Pro",
    price: "10",
    currency: "EUR",
    ...overrides,
  };
}

function renderHub(props: Partial<React.ComponentProps<typeof EditHub>> = {}) {
  return renderWithConfig(
    <EditHub
      t={newTier()}
      communityTag="orbis"
      onUpdate={() => {}}
      showMemberPricing={false}
      showToast={() => {}}
      {...props}
    />,
  );
}

describe("EditHub (product) — landing view", () => {
  it("renders 3 section cards by default (Basics / Options / Form)", () => {
    renderHub();
    // SectionCard renders titles as <h3>. Query by role+name to scope
    // away the FormStep stub copy (rendered DOM-present but hidden;
    // contains the same words in plain <p> tags).
    expect(screen.getByRole("heading", { name: "Basics", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Options", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Member pricing", level: 3 })).not.toBeInTheDocument();
  });

  it("renders the Member pricing card when showMemberPricing is true", () => {
    renderHub({ showMemberPricing: true });
    expect(screen.getByText("Member pricing")).toBeInTheDocument();
  });

  it("Basics description: name · price", () => {
    renderHub({ t: newTier({ name: "Pro", price: "9.99", currency: "USD" }) });
    expect(screen.getByText(/Pro · \$9\.99/)).toBeInTheDocument();
  });

  it("Basics description: flags Recurring tier with interval", () => {
    renderHub({
      t: newTier({ isRecurring: true, recurringInterval: "monthly" }),
    });
    expect(screen.getByText(/Recurring · monthly/)).toBeInTheDocument();
  });

  it("Basics description: flags Installment plan", () => {
    renderHub({
      t: newTier({
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "3",
        installmentAccessMonths: "12",
      }),
    });
    expect(screen.getByText(/Installment plan/)).toBeInTheDocument();
  });

  it("Options description: capacity + pwyw + installment summary with access months", () => {
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
    expect(screen.getByText(/3× over 1 mo.*12mo access/)).toBeInTheDocument();
  });

  it("disables Members + Form Edit buttons on unsaved tier", () => {
    renderHub({ t: newTier({ id: undefined }), showMemberPricing: true });
    const editButtons = screen.getAllByRole("button", { name: /^Edit/ });
    // Order: Basics, Options, Members, Form
    expect(editButtons[0]).not.toBeDisabled();
    expect(editButtons[1]).not.toBeDisabled();
    expect(editButtons[2]).toBeDisabled();
    expect(editButtons[3]).toBeDisabled();
  });
});

describe("EditHub (product) — step navigation", () => {
  it("Edit on Basics opens the Basics step + Done returns to hub", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(screen.getByRole("heading", { name: "Basics", level: 4 })).toBeInTheDocument();
    // Tier name moved to TierCard's inline header; the Basics step's
    // first visible input is now the price.
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Done/i }));
    expect(screen.queryByRole("heading", { name: "Basics", level: 4 })).not.toBeInTheDocument();
  });

  it("Back arrow returns to the hub from a step", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(screen.getByRole("heading", { name: "Basics", level: 4 })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Back to hub"));
    expect(screen.queryByRole("heading", { name: "Basics", level: 4 })).not.toBeInTheDocument();
  });

  it("Edit on Options opens the Options step with capacity input", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[1]);
    expect(screen.getByRole("heading", { name: "Options", level: 4 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("∞")).toBeInTheDocument();
  });
});

describe("EditHub (product) — Basics step ↔ Billing radio", () => {
  it("picking Recurring sets isRecurring=true + installmentEnabled=false", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderHub({ onUpdate });
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    await user.click(screen.getByLabelText(/^Recurring/));
    expect(onUpdate).toHaveBeenCalledWith({
      isRecurring: true,
      installmentEnabled: false,
    });
  });

  it("picking Installment plan sets installmentEnabled=true + isRecurring=false", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderHub({ onUpdate });
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    await user.click(screen.getByLabelText(/Installment plan/));
    expect(onUpdate).toHaveBeenCalledWith({
      isRecurring: false,
      installmentEnabled: true,
    });
  });

  it("surfaces the Recurring option (unlike events which hides it)", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(screen.getByLabelText(/^Recurring/)).toBeInTheDocument();
  });
});
