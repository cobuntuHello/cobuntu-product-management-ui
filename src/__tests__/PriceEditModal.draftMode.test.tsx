import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";
import { blankTier, blankDonation } from "../components/PriceEditModal/helpers";

/**
 * draftMode pins the contract used by the create-product flow (ProductForm's
 * tier wizard): the modal renders entirely against parent-owned state, fires
 * NO fetches, and hands the validated drafts back via onDraftCommit when the
 * user clicks Save. The parent (ProductForm) holds the drafts in its own form
 * state and POSTs them as part of the create-product payload. Ported 1:1 from
 * the events package so both surfaces behave identically.
 */

const baseProps = (overrides: any = {}) => ({
  product: { price: 0, currency: "EUR", isRecurring: false, recurringInterval: "monthly" },
  productId: "",
  communityTag: "orbis",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  draftMode: true,
  onDraftCommit: vi.fn(),
  ...overrides,
});

describe("PriceEditModal — draftMode (products)", () => {
  it("does NOT fetch /tiers, /stripe, or /segments on mount", async () => {
    const fetchFn = mockFetch([]);
    renderWithConfig(<PriceEditModal {...baseProps()} showMemberPricing />);

    // A single blank tier is rendered as the only L1 row.
    await screen.findByRole("button", { name: /Standard/ });

    // No backend call fired during mount — draftMode owns the source of truth.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("seeds drafts from initialDraftTiers when provided", async () => {
    mockFetch([]);
    const initial = [
      { ...blankTier({ currency: "EUR" }), name: "VIP", price: "50" },
      { ...blankTier({ currency: "EUR", indexHint: 2 }), name: "GA", price: "20" },
    ];
    renderWithConfig(<PriceEditModal {...baseProps()} initialDraftTiers={initial} />);

    await screen.findByRole("button", { name: /VIP/ });
    expect(screen.getByRole("button", { name: /GA/ })).toBeInTheDocument();
  });

  it("on Save: calls onDraftCommit with the current drafts + donation, then onSaved", async () => {
    const fetchFn = mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{ ...blankTier({ currency: "EUR" }), name: "GA", price: "10" }],
      initialDraftDonation: { ...blankDonation("EUR"), enabled: true },
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /GA/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    const payload = props.onDraftCommit.mock.calls[0][0];
    expect(payload.tiers).toHaveLength(1);
    expect(payload.tiers[0]).toMatchObject({ name: "GA", price: "10" });
    expect(payload.donation).toMatchObject({ enabled: true });
    expect(props.onSaved).toHaveBeenCalled();
    // Never touched the network.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("on validation failure: surfaces error via showToast, does NOT call onDraftCommit", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{ ...blankTier({ currency: "EUR" }), name: "", price: "10" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    // A nameless tier still renders a row; Save runs validateTier and fails.
    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(props.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Tier name is required/i),
      ),
    );
    expect(props.onDraftCommit).not.toHaveBeenCalled();
  });
});
