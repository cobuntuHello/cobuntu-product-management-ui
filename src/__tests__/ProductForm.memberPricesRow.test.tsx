import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import { ProductForm } from "../components/ProductForm";
import { renderWithConfig } from "./test-utils";
import { blankTier } from "../components/PriceEditModal/helpers";
import { memberPricingSummary, variantTakesMemberPricing } from "../components/memberPricesRow";

/**
 * The "Member prices" row on the create wizard's pricing step.
 *
 * Member pricing was reachable while creating an item only at the bottom of
 * each variant's editor, below files, links, licence, attributes, price and
 * billing mode. A seller creating a product on Pathseekers looked for it and
 * did not find it (2026-11-10). The row puts it on the step, says what is set,
 * and opens the variant's editor at that section.
 */

const SEGMENTS = [
  { id: "seg-free", name: "Free" },
  { id: "seg-creators", name: "Creators membership" },
];

const tier = (o: Record<string, unknown> = {}) => ({
  ...blankTier({ currency: "EUR" }), name: "Standard", ...o,
});

function stubSegments(segments: unknown[] = SEGMENTS) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (/\/member-pricing\/segments(\?scope=community)?$/.test(String(url))) {
      return { ok: true, json: async () => segments } as any;
    }
    return { ok: false, json: async () => ({}) } as any;
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function renderForm(tiers: unknown[], extra: Record<string, unknown> = {}) {
  return renderWithConfig(
    <ProductForm
      communityTag="pathseekers"
      showTiers
      showMemberPricing
      ownership="personal"
      page="commerce"
      onChange={vi.fn()}
      initialData={{
        name: "P", description: "", tags: [], mediaItems: [], productFiles: [],
        isPaid: true, price: "", currency: "EUR", isRecurring: false,
        recurringInterval: "monthly", ctaText: "", tiers,
      } as any}
      {...extra}
    />,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("memberPricesRow helpers", () => {
  it("a variant that charges takes member pricing; a free one does not", () => {
    expect(variantTakesMemberPricing({ price: "275", priceMode: "fixed" })).toBe(true);
    expect(variantTakesMemberPricing({ price: "0", priceMode: "fixed" })).toBe(false);
    expect(variantTakesMemberPricing({ price: "", priceMode: "fixed" })).toBe(true); // "Price needed" after Paid
    expect(variantTakesMemberPricing({ price: "0", priceMode: "pwyw" })).toBe(true);
  });

  it("summarises each override against the tier's name", () => {
    const s = memberPricingSummary({
      currency: "EUR",
      draftMemberPricing: [
        { segmentId: "seg-creators", mode: "FIXED_PRICE", value: 4000 },
        { segmentId: "seg-free", mode: "PERCENT_OFF", value: 20 },
      ],
    } as any, SEGMENTS);
    expect(s).toBe("Creators membership €40.00 · Free 20% off");
  });

  it("is null with no overrides, and keeps a tier the community no longer lists", () => {
    expect(memberPricingSummary({ currency: "EUR", draftMemberPricing: null } as any, SEGMENTS)).toBeNull();
    expect(memberPricingSummary({
      currency: "EUR", draftMemberPricing: [{ segmentId: "gone", mode: "FREE" }],
    } as any, SEGMENTS)).toBe("A tier free");
  });
});

describe("ProductForm — Member prices row on the pricing step", () => {
  it("shows for a paid variant, and asks the seller's tier list", async () => {
    const fetchSpy = stubSegments();
    renderForm([tier({ price: "275" })]);
    expect(await screen.findByText("Add member prices")).toBeTruthy();
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain("/api/communities/pathseekers/member-pricing/segments");
  });

  it("summarises what is already set", async () => {
    stubSegments();
    renderForm([tier({ price: "275", draftMemberPricing: [{ segmentId: "seg-creators", mode: "FIXED_PRICE", value: 6500 }] })]);
    expect(await screen.findByText("Creators membership €65.00")).toBeTruthy();
    expect(screen.getByText("Member prices")).toBeTruthy();
  });

  it("one row per paid variant when there are several", async () => {
    stubSegments();
    renderForm([tier({ price: "275" }), tier({ name: "Premium", price: "400" })]);
    expect(await screen.findByText("Member prices · Standard")).toBeTruthy();
    expect(screen.getByText("Member prices · Premium")).toBeTruthy();
  });

  it("hidden for a free product", async () => {
    const fetchSpy = stubSegments();
    renderForm([tier({ price: "0" })]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText("Add member prices")).toBeNull();
  });

  it("hidden when the community has no tier to price for", async () => {
    const fetchSpy = stubSegments([]);
    renderForm([tier({ price: "275" })]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText("Add member prices")).toBeNull();
  });

  it("a leader's community-owned item reads every tier with scope=community, not the leaders' admin list", async () => {
    const fetchSpy = stubSegments();
    renderForm([tier({ price: "275" })], { ownership: "community" });
    await screen.findByText("Add member prices");
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toContain("/api/communities/pathseekers/member-pricing/segments?scope=community");
  });
});
