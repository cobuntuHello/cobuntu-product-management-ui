import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderWithConfig, mockFetch } from "./test-utils";
import { ProductForm } from "../components/ProductForm";
import { blankTier } from "../components/PriceEditModal/helpers";

/**
 * Covers feat/wizard-presets-and-banners's pricing-step changes:
 *   1. The "Variants" title/subtext + wrapper card are gone; tier cards
 *      still render standalone.
 *   2. The three preset cards derive their "selected" state from the actual
 *      tier/donation config, in all four combinations the spec calls out.
 *   3. The reset-confirm (DiscardPrompt) gate: raised only once the seller
 *      has manually touched config a preset tap would overwrite.
 *   4. The dismissible pricing tip's dismiss behavior.
 *
 * Behavioral assertions, not snapshots — per this repo's test conventions.
 */

const base = { communityTag: "acme", onChange: vi.fn(), showTiers: true, categories: [] as any[] };

function connectStripe() {
  return mockFetch([
    { method: "GET", url: /\/stripe\/connected$/, body: { connected: true } },
  ]);
}

describe("the old Variants header and wrapper card are gone", () => {
  it("no longer renders the 'Variants' title or its subtext", () => {
    renderWithConfig(<ProductForm {...base} />);
    expect(screen.queryByText("Variants")).not.toBeInTheDocument();
    expect(screen.queryByText(/Open one to add its downloadable content/)).not.toBeInTheDocument();
  });

  it("still renders the seeded tier as its own standalone card", () => {
    renderWithConfig(<ProductForm {...base} initialData={{ tiers: [blankTier({ currency: "EUR" })] }} />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
    // "Add variant" is discoverable directly below the last tier card now,
    // with no enclosing wrapper or dashed-card panel around the list.
    expect(screen.getByText("Add variant")).toBeInTheDocument();
  });

  it("documents the removal with a WHY comment, not just deleted code", () => {
    const src = readFileSync(resolve(__dirname, "../components/ProductForm.tsx"), "utf8");
    expect(src).toContain("old in-card \"Variants\" title + subtext and the enclosing");
  });
});

describe("preset-card selection sync", () => {
  const seedTier = (price: string) => ({ ...blankTier({ currency: "EUR" }), price });

  it("selects Free when price is 0 and donations are off", () => {
    renderWithConfig(<ProductForm {...base} initialData={{ tiers: [seedTier("0")] }} />);
    expect(screen.getByRole("button", { name: /^Free$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Paid/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Free with donations" })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects Paid when price is positive and donations are off", () => {
    renderWithConfig(<ProductForm {...base} initialData={{ tiers: [seedTier("25")] }} />);
    expect(screen.getByRole("button", { name: /^Paid/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Free$/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects Free with donations when price is 0 and donations are on", () => {
    renderWithConfig(<ProductForm {...base} initialData={{
      tiers: [seedTier("0")],
      donation: { enabled: true, mode: "fixed", amounts: ["5"], minAmount: "", currency: "EUR", label: "" },
    }} />);
    expect(screen.getByRole("button", { name: "Free with donations" })).toHaveAttribute("aria-pressed", "true");
  });

  it("still highlights Paid when price is positive AND donations are on (closest match, per spec)", () => {
    renderWithConfig(<ProductForm {...base} initialData={{
      tiers: [seedTier("25")],
      donation: { enabled: true, mode: "fixed", amounts: ["5"], minAmount: "", currency: "EUR", label: "" },
    }} />);
    expect(screen.getByRole("button", { name: /^Paid/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Free with donations" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("reset-confirm guard on preset taps", () => {
  it("applies immediately with no modal on a pristine form", () => {
    renderWithConfig(<ProductForm {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Free with donations" }));
    // No discard prompt — nothing was configured yet to lose.
    expect(screen.queryByText("Replace your pricing setup?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Free with donations" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies immediately when the tapped preset already matches the current state", () => {
    renderWithConfig(<ProductForm {...base} initialData={{ tiers: [blankTier({ currency: "EUR" })] }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Free$/ }));
    expect(screen.queryByText("Replace your pricing setup?")).not.toBeInTheDocument();
  });

  it("confirms before overwriting donation config the seller set manually", async () => {
    renderWithConfig(<ProductForm {...base} />);
    // Manually enable donations via the real donations field (sets the
    // pricingDirty flag), not via a preset tap.
    const donationsToggle = screen.getByRole("switch", { name: /donation/i });
    fireEvent.click(donationsToggle);

    fireEvent.click(screen.getByRole("button", { name: /^Free$/ }));
    expect(screen.getByText("Replace your pricing setup?")).toBeInTheDocument();

    // Cancelling keeps the manual config intact.
    fireEvent.click(screen.getByRole("button", { name: "Keep my setup" }));
    expect(screen.queryByText("Replace your pricing setup?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Free with donations" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies the preset once the discard is confirmed", async () => {
    renderWithConfig(<ProductForm {...base} />);
    const donationsToggle = screen.getByRole("switch", { name: /donation/i });
    fireEvent.click(donationsToggle);

    fireEvent.click(screen.getByRole("button", { name: /^Free$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use preset" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Free$/ })).toHaveAttribute("aria-pressed", "true");
    });
  });
});

describe("pricing tip banner dismiss", () => {
  it("renders the tip and removes it once dismissed", async () => {
    // Dismiss now plays a short close transition before unmounting (local
    // "closing" state + setTimeout in DismissibleTipBanner), so the removal
    // is asynchronous — wait for it instead of asserting immediately.
    renderWithConfig(<ProductForm {...base} />);
    expect(screen.getByText("Good to know")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(screen.queryByText("Good to know")).not.toBeInTheDocument();
    });
  });
});

describe("the Paid preset respects the Stripe-connected gate", () => {
  // The card is now ALWAYS a real click target (product-owner feedback: a
  // dead disabled card with nothing to click was worse than one that guides
  // the seller toward connecting Stripe) — never `disabled`. It stays
  // visually muted and does not apply the preset until Stripe is connected.
  it("stays clickable (not disabled) and does not apply the preset until the community has a connected account", () => {
    renderWithConfig(<ProductForm {...base} />);
    const paidButton = screen.getByRole("button", { name: /^Paid/ });
    expect(paidButton).not.toBeDisabled();
    expect(screen.getByText(/Connect Stripe to sell for a price/)).toBeInTheDocument();
    fireEvent.click(paidButton);
    expect(paidButton).toHaveAttribute("aria-pressed", "false");
  });

  it("drops the Stripe-connect hint once useStripeStatus resolves connected: true, and clicking applies the preset path (not a navigation)", async () => {
    connectStripe();
    renderWithConfig(<ProductForm {...base} />);
    const paidButton = screen.getByRole("button", { name: /^Paid/ });
    await waitFor(() => {
      expect(screen.queryByText(/Connect Stripe to sell for a price/)).not.toBeInTheDocument();
    });
    // Clicking now goes through tapPricingPreset rather than the
    // connect-Stripe redirect — the rich description (not the connect hint)
    // stays on screen.
    fireEvent.click(paidButton);
    expect(screen.getByText(/Buyers pay to get access/)).toBeInTheDocument();
  });

  it("stripeStatusOverride wins over the internal useStripeStatus check", () => {
    // No mockFetch stub here on purpose: the internal hook's own fetch would
    // fail with "Unmocked fetch" if it were ever awaited for this assertion,
    // which proves the override short-circuits it synchronously (the override
    // path sets `loading: false, known: true` immediately, no fetch needed).
    // The internal hook still runs (same hook order every render) and is
    // left to resolve `connected: false` in the background — irrelevant,
    // since the override must win.
    renderWithConfig(<ProductForm {...base} stripeStatusOverride={{ connected: true }} />);
    const paidButton = screen.getByRole("button", { name: /^Paid/ });
    expect(screen.queryByText(/Connect Stripe to sell for a price/)).not.toBeInTheDocument();
    fireEvent.click(paidButton);
    expect(screen.getByText(/Buyers pay to get access/)).toBeInTheDocument();
  });
});
