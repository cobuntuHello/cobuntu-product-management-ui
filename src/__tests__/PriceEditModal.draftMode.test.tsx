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

/**
 * Reported 2026-08-08 on /marketplace/new: "the Save button does nothing or at
 * least gives no visual feedback."
 *
 * The cause was not the Save handler — it correctly refused a tier with no
 * price and raised "Price required". It was that ProductForm passed
 * `showToast={() => {}}`, so the modal's only error channel was a stub. The
 * message was produced and discarded, the modal stayed open unchanged, and
 * Save looked dead.
 *
 * These assert what a user can SEE, with showToast deliberately a no-op — the
 * exact wiring the create form uses. A test that asserted showToast was called
 * would have passed throughout the entire time the bug was live.
 */
describe("PriceEditModal — draftMode save failures are visible without a host toast", () => {
  it("renders the validation failure inside the modal", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    /*
     * An empty price is stated explicitly rather than inherited from
     * blankTier. The seed used to carry `price: ""` and this test leaned on
     * that; the seed now carries "0" so that adding a second tier does not
     * dead-end on "Price required for Standard". The behaviour under test —
     * a validation failure has to be VISIBLE when the host passes no toast —
     * is unchanged, so the state it needs is set here instead.
     */
    const props = baseProps({
      showToast: () => {},
      initialDraftTiers: [{ ...blankTier({ currency: "EUR" }), name: "Standard", price: "" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /Standard/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/price required/i);
    // And it did NOT silently commit a draft the user never completed.
    expect(props.onDraftCommit).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("clears a previous failure when the user fixes it and saves again", async () => {
    // Otherwise the banner becomes a permanent scold that outlives the problem.
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      showToast: () => {},
      initialDraftTiers: [{ ...blankTier({ currency: "EUR" }), name: "Standard", price: "" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /Standard/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    // Give it a price, save again — the banner goes and the commit lands.
    // The price field lives inside the tier (L2), not on the L1 list.
    await user.click(screen.getByRole("button", { name: /Standard/ }));
    const price = await screen.findByPlaceholderText("0.00");
    await user.type(price, "25");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * Registration form on an UNSAVED tier.
 *
 * Reported 2026-08-08: "the form picker is disabled and says I must save
 * first — this is the free default price tier that is always on display on
 * the form either way. Why can't I add a form already?"
 *
 * It was disabled because a form is keyed on tierId and a draft tier has none.
 * The backend now takes the form inline on the create payload, so in draftMode
 * the builder edits t.draftForm and it ships with the tier. These pin the two
 * halves that could regress independently: the row being reachable at all, and
 * what the builder does with no tier to PUT against.
 */
describe("PriceEditModal — draftMode registration form", () => {
  it("the Registration form row is reachable on an unsaved tier", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));

    const row = await screen.findByRole("button", { name: /Registration form/i });
    expect(row).not.toBeDisabled();
    // The old copy told the user to go away; it must not come back.
    expect(row.textContent).not.toMatch(/save first/i);
    expect(row.textContent).toMatch(/none/i);
  });

  it("reports the staged field count, not the server's", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{
        ...blankTier({ currency: "EUR" }),
        name: "Standard",
        price: "10",
        // hasForm/formFieldCount describe a SAVED tier's server copy and must
        // not be consulted for a draft — reading them here would show 0.
        draftForm: { fields: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
      }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));

    const row = await screen.findByRole("button", { name: /Registration form/i });
    expect(row.textContent).toMatch(/2 fields/i);
  });

  it("actually RENDERS the builder on a draft tier", async () => {
    // The test below this one — "fires no request" — passed the whole time the
    // builder was still refusing to draw, because an early return produces no
    // fetch just as effectively as a working draft path does. Absence of a
    // request is not evidence of presence of a form.
    //
    // So this asserts the builder is USABLE: the "+ Question" action it
    // portals into the footer is only rendered once the gate is passed.
    // Reported 2026-08-09 after the first fix shipped: "I am still unable to
    // create a form on the standard tier."
    mockFetch([]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));
    await user.click(await screen.findByRole("button", { name: /Registration form/i }));

    // The gate's own copy is the sharpest signal: if it is on screen the
    // builder did not draw. Asserting its ABSENCE plus the presence of the
    // page-label input proves the component got past the early return.
    // ("+ Question" portals into the footer slot, which does not mount here.)
    expect(screen.queryByText(/save tier first/i)).toBeNull();
    // "Add question" is the builder's own action — it only exists past the
    // gate. Paired with the gate copy being absent, that is the difference
    // between "did not fetch" and "actually works".
    expect(await screen.findByRole("button", { name: /add question/i })).toBeTruthy();
    expect(screen.getAllByText(/no questions yet/i).length).toBeGreaterThan(0);
  });

  it("fires no request when opening the builder on a draft tier", async () => {
    // The whole point: there is no tier to GET a form from. A stray call would
    // 404 against a tierId that does not exist.
    const fetchFn = mockFetch([]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));
    await user.click(await screen.findByRole("button", { name: /Registration form/i }));

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("carries the staged form out through onDraftCommit", async () => {
    // End to end for this layer: what the parent receives is what the create
    // payload sends.
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{
        ...blankTier({ currency: "EUR" }),
        name: "Standard",
        price: "10",
        draftForm: { fields: [{ id: "a", label: "Your name" }] },
      }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /Standard/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    const committed = props.onDraftCommit.mock.calls[0][0];
    expect(committed.tiers[0].draftForm.fields).toHaveLength(1);
  });
});
