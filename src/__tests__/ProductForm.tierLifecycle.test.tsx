import { describe, it, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductForm } from "../components/ProductForm";
import { renderWithConfig } from "./test-utils";

vi.mock("react-quill-new", () => ({ default: () => null }));

/**
 * Adding a pricing tier — the create/cancel lifecycle.
 *
 * Reported 2026-08-09: "whenever I open/close this modal, it's creating a new
 * tier on the card". addAndEditTier appended a blankTier to the form's state
 * and THEN opened the modal, but the modal's direct-open footer button is
 * Cancel and only calls onClose() — nothing rolled the append back. Worse,
 * blankTier names by position and no indexHint was passed, so every tier came
 * out "Standard": three cancels left three identical rows.
 *
 * The fix makes the commit callback the only writer of the tiers array. These
 * tests pin that, because the failure mode is silent — a stray tier looks like
 * something the member did, not like a bug.
 */

/**
 * A named, priced tier. ProductForm seeds its state with ONE blank "Standard"
 * tier, and Save validates every draft in the modal — so without a valid seed
 * the modal can never be saved and these tests would be measuring validation,
 * not the add/cancel lifecycle.
 */
const SEED_TIER = {
  localId: "seed-standard",
  name: "Standard",
  description: "",
  price: "10",
  currency: "USD",
  capacity: "",
  priceMode: "fixed" as const,
  pwywMin: "",
  isRecurring: false,
  recurringInterval: "monthly" as const,
  installmentEnabled: false,
  installmentTotal: "",
  installmentCount: "",
  installmentInterval: "",
  installmentAccessMonths: "",
  hasForm: false,
  formFieldCount: 0,
  autoScheduleEnabled: false,
  salesStartAt: "",
  salesEndAt: "",
  publishedAt: new Date().toISOString(),
  salesCount: 0,
  deleted: false,
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  communityTag: "orbis",
  initialData: {
    name: "Cool product",
    description: "",
    tags: [],
    mediaItems: [],
    productFiles: [],
    isPaid: false,
    price: "",
    currency: "USD",
    isRecurring: false,
    recurringInterval: "monthly" as const,
    ctaText: "",
    tiers: [{ ...SEED_TIER }] as any,
  },
  onChange: vi.fn(),
  // The Pricing card (and therefore every tier affordance) only renders when
  // the consumer opts into tiers. The community app's create wizard does.
  showTiers: true,
  ...overrides,
});

/** The Pricing card's tier rows — each row is a button that opens the tier. */
function tierRowNames(): string[] {
  // Tier rows are the buttons inside the Pricing card that carry a tier name.
  // "Set pricing" / "Add pricing tier" are the add affordance, not rows.
  return screen
    .queryAllByRole("button")
    .map((b) => b.textContent || "")
    .filter((t) => /Standard|Tier \d|Unnamed tier/.test(t))
    .map((t) => t.trim());
}

/**
 * Give the tier the modal has open a price. Save validates every draft, and a
 * priceless tier is rejected — so without this the modal never closes and the
 * test would be measuring validation instead of the lifecycle.
 */
async function priceTheOpenTier(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const price = within(dialog).getAllByRole("spinbutton")[0]!;
  await user.clear(price);
  await user.type(price, "25");
}

async function openTierModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /set pricing|add pricing tier/i }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
}

describe("ProductForm — adding a pricing tier", () => {
  it("cancelling the tier modal leaves no tier behind", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);

    await openTierModal(user);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Still just the seeded tier — the cancelled one left nothing behind.
    expect(tierRowNames()).toHaveLength(1);

    // And the parent was never told about a second tier either: the row list
    // and the submitted payload read the same state, so both must stay clean.
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.tiers ?? []).toHaveLength(1);
  });

  it("cancelling three times still leaves no tiers", async () => {
    // The reported symptom exactly: repeated open/close piled up rows.
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps()} />);

    for (let i = 0; i < 3; i++) {
      await openTierModal(user);
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    expect(tierRowNames()).toHaveLength(1);
  });

  it("saving the tier modal adds exactly one tier", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps()} />);

    await openTierModal(user);
    const dialog = screen.getByRole("dialog");
    await priceTheOpenTier(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(tierRowNames()).toHaveLength(2);
  });

  it("names the second tier by position, not another Standard", async () => {
    // blankTier names on indexHint; passing none defaulted every tier to 1,
    // which is why duplicates were indistinguishable.
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps()} />);

    await openTierModal(user);
    await priceTheOpenTier(user, screen.getByRole("dialog"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const names = tierRowNames();
    // Seeded "Standard" + the one just added.
    expect(names).toHaveLength(2);
    expect(names.some((n) => /Tier 2/.test(n))).toBe(true);
  });
});
