import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ProductForm } from "../components/ProductForm";
import { createSharedTranslator } from "@cobuntu/management-ui-shared";
import { memberPriceRowError, MEMBER_PRICES_NS } from "../components/MemberPricesStep";
import { renderWithConfig } from "./test-utils";
import { blankTier } from "../components/PriceEditModal/helpers";

/**
 * The create wizard's "Member prices" step (memberPricesStep + page="members").
 *
 * Member pricing at create time lived in each variant's editor, then as a row
 * under the prices; sellers missed both (Pathseekers, 2026-11-10 and
 * 2026-11-12), and the row also hid itself when the tier list did not load or
 * nothing was priced. The step is always there and says why when there is
 * nothing to set.
 */

const SEGMENTS = [
  { id: "seg-free", name: "Free" },
  { id: "seg-creators", name: "Creators membership" },
];

const tier = (o: Record<string, unknown> = {}) => ({
  ...blankTier({ currency: "EUR" }), name: "Standard", ...o,
});

function stubSegments(segments: unknown[] | "fail" = SEGMENTS) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (/\/member-pricing\/segments(\?scope=community)?$/.test(String(url))) {
      if (segments === "fail") return { ok: false, status: 500, json: async () => ({}) } as any;
      return { ok: true, json: async () => segments } as any;
    }
    return { ok: false, json: async () => ({}) } as any;
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function renderForm(tiers: unknown[], extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const utils = renderWithConfig(
    <ProductForm
      communityTag="pathseekers"
      showTiers
      showMemberPricing
      memberPricesStep
      ownership="personal"
      memberPricingScope="seller"
      page="members"
      onChange={onChange}
      initialData={{
        name: "P", description: "", tags: [], mediaItems: [], productFiles: [],
        isPaid: true, price: "", currency: "EUR", isRecurring: false,
        recurringInterval: "monthly", ctaText: "", tiers,
      } as any}
      {...extra}
    />,
  );
  const last = () => onChange.mock.calls.at(-1)?.[0];
  return { ...utils, onChange, last };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("memberPriceRowError", () => {
  const row = (o: Record<string, unknown>) => ({ enabled: true, mode: "PERCENT_OFF", value: "20", segmentName: "Coach", ...o }) as any;
  // The shared package's English, exactly as a host with no translations gets it.
  const en = createSharedTranslator();
  const tEn = (k: string, v?: Record<string, string | number | Date>) => en(`${MEMBER_PRICES_NS}.${k}`, v);

  it("accepts an unticked row, a free one, and a sensible amount", () => {
    expect(memberPriceRowError(row({ enabled: false, value: "" }), tEn)).toBeNull();
    expect(memberPriceRowError(row({ mode: "FREE", value: "" }), tEn)).toBeNull();
    expect(memberPriceRowError(row({ mode: "FIXED_PRICE", value: "65" }), tEn)).toBeNull();
    expect(memberPriceRowError(row({ mode: "PERCENT_OFF", value: "100" }), tEn)).toBeNull();
  });

  it("refuses a ticked tier with no amount, and a percentage that is not a whole 1 to 100", () => {
    expect(memberPriceRowError(row({ value: "" }), tEn)).toBe("Enter an amount for Coach, or untick it.");
    expect(memberPriceRowError(row({ value: "150" }), tEn)).toMatch(/^Coach: the discount must be/);
    expect(memberPriceRowError(row({ value: "12.5" }), tEn)).toMatch(/^Coach: the discount must be/);
    expect(memberPriceRowError(row({ mode: "FLAT_OFF", value: "-1" }), tEn)).toBe("Enter an amount for Coach, or untick it.");
  });
});

describe("ProductForm: the Member prices step", () => {
  it("lists each paid variant with the community's tiers, from the seller's tier list", async () => {
    const fetchSpy = stubSegments();
    renderForm([tier({ price: "275" })]);
    expect(await screen.findByLabelText("Offer Creators membership a member price")).toBeTruthy();
    expect(screen.getByLabelText("Offer Free a member price")).toBeTruthy();
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.getByText("€275.00")).toBeTruthy();
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain("/api/communities/pathseekers/member-pricing/segments");
  });

  it("a leader's community-owned item reads every tier with scope=community", async () => {
    const fetchSpy = stubSegments();
    renderForm([tier({ price: "275" })], { ownership: "community", memberPricingScope: "community" });
    await screen.findByLabelText("Offer Creators membership a member price");
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain("/api/communities/pathseekers/member-pricing/segments?scope=community");
    expect(screen.getByText(/Give members of your tiers a lower price/)).toBeTruthy();
  });

  it("ticking a tier and typing a discount puts it on the variant the create payload carries", async () => {
    stubSegments();
    const { last } = renderForm([tier({ price: "275" })]);
    fireEvent.click(await screen.findByLabelText("Offer Creators membership a member price"));
    fireEvent.change(screen.getByLabelText("Member price for Creators membership"), { target: { value: "20" } });
    await waitFor(() => {
      expect(last()?.tiers?.[0]?.draftMemberPricing).toEqual([
        { segmentId: "seg-creators", mode: "PERCENT_OFF", value: 20, priority: 0 },
      ]);
    });
    expect(last()?.memberPricingError).toBeNull();
  });

  it("shows a saved fixed price in the currency, and unticking removes it", async () => {
    stubSegments();
    const { last } = renderForm([
      tier({ price: "275", draftMemberPricing: [{ segmentId: "seg-creators", mode: "FIXED_PRICE", value: 6500, priority: 0 }] }),
    ]);
    const amount = await screen.findByLabelText("Member price for Creators membership");
    expect((amount as HTMLInputElement).value).toBe("65");
    fireEvent.click(screen.getByLabelText("Offer Creators membership a member price"));
    await waitFor(() => expect(last()?.tiers?.[0]?.draftMemberPricing).toBeNull());
  });

  it("an invalid amount holds the wizard (memberPricingError) and leaves the last valid prices on the variant", async () => {
    stubSegments();
    const { last } = renderForm([tier({ price: "275" })]);
    fireEvent.click(await screen.findByLabelText("Offer Creators membership a member price"));
    fireEvent.change(screen.getByLabelText("Member price for Creators membership"), { target: { value: "150" } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() => expect(last()?.memberPricingError).toMatch(/^Creators membership: the discount must be/));
    expect(last()?.tiers?.[0]?.draftMemberPricing ?? null).toBeNull();
  });

  it("an empty amount on a freshly ticked tier is only called out after a refused Next", async () => {
    stubSegments();
    const { last } = renderForm([tier({ price: "275" })]);
    fireEvent.click(await screen.findByLabelText("Offer Creators membership a member price"));
    await waitFor(() => expect(last()?.memberPricingError).toBe("Enter an amount for Creators membership, or untick it."));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says plainly when the community has published no tiers", async () => {
    stubSegments([]);
    renderForm([tier({ price: "275" })]);
    expect(await screen.findByText(/hasn't published any membership tiers yet/)).toBeTruthy();
  });

  it("says plainly when nothing is priced yet", async () => {
    stubSegments();
    renderForm([tier({ price: "0" })]);
    expect(await screen.findByText(/Everything here is free/)).toBeTruthy();
  });

  it("offers to try again when the tier list does not load, and reads it again", async () => {
    const fetchSpy = stubSegments("fail");
    renderForm([tier({ price: "275" })]);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => {
      const reads = fetchSpy.mock.calls.filter((c) => /member-pricing\/segments/.test(String(c[0])));
      expect(reads.length).toBe(2);
    });
  });

  it("with the step on, the pricing step's 'Member prices' row steps aside", async () => {
    const fetchSpy = stubSegments();
    renderForm([tier({ price: "275" })], { page: "commerce" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText("Add member prices")).toBeNull();
  });

  it("drops member prices from a variant that no longer charges", async () => {
    stubSegments();
    const { last } = renderForm([
      tier({ price: "0", draftMemberPricing: [{ segmentId: "seg-creators", mode: "PERCENT_OFF", value: 20, priority: 0 }] }),
    ]);
    await waitFor(() => expect(last()).toBeTruthy());
    expect(last()?.tiers?.[0]?.draftMemberPricing ?? null).toBeNull();
  });
});
