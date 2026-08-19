import { describe, it, expect } from "vitest";
import { visibleProductViews } from "../page/ProductManagePage";

/**
 * Which tabs a viewer gets. The rule that matters is the FAILURE direction:
 * dropping a tab the owner needs is the same class of bug as the manage route
 * 404ing on someone who could manage — the page silently loses features for
 * the person it belongs to, and nothing surfaces an error.
 */

/*
 * "details" is in this set, and that is the point of the test.
 *
 * The nav's SECTIONS list and this allowed list are INTERSECTED, so a tab in
 * one and not the other silently vanishes. That shipped: Details was added to
 * the nav only, and editing a product became unreachable in production. Pinning
 * the exact set here is what makes the next such omission fail loudly.
 *
 * "listings" left the set when Overview began carrying the listings itself,
 * with more per listing than that tab ever showed. The KEY still resolves so an
 * existing ?view=listings link keeps working; it is simply not a tab.
 */
const SELLER_SET = ["overview", "details", "collaborators", "activity"];
const MODERATOR_SET = ["overview", "activity"];

describe("visibleProductViews", () => {
  it("gives the owner every tab", () => {
    expect(visibleProductViews({ product: { ownerId: "u1" }, viewerUserId: "u1" })).toEqual(SELLER_SET);
  });

  it("gives a co-seller every tab", () => {
    expect(
      visibleProductViews({
        product: { ownerId: "u1", collaborators: [{ userId: "u2" }] },
        viewerUserId: "u2",
      }),
    ).toEqual(SELLER_SET);
  });

  it("gives a leader reviewing someone else's product the moderator set", () => {
    // Not their bench to rewrite, not their listings to place.
    expect(visibleProductViews({ product: { ownerId: "u1" }, viewerUserId: "leader" })).toEqual(MODERATOR_SET);
  });

  it("defaults an UNKNOWN viewer to the full set, not the reduced one", () => {
    // A host app that forgets viewerUserId must not silently strip the
    // owner's own tabs. Reaching this page already required canManageProduct,
    // so the permissive answer is never a leak.
    expect(visibleProductViews({ product: { ownerId: "u1" } })).toEqual(SELLER_SET);
    expect(visibleProductViews({ product: { ownerId: "u1" }, viewerUserId: null })).toEqual(SELLER_SET);
  });

  it("honours forceModerator as an explicit assertion", () => {
    // The only way to get the reduced set without knowing the viewer — it has
    // to be said, it cannot happen by omission.
    expect(visibleProductViews({ product: { ownerId: "u1" }, forceModerator: true })).toEqual(MODERATOR_SET);
  });

  it("lets forceModerator win even over the owner", () => {
    // The app is asserting "this surface is review", and a surface that shows
    // one leader the seller tools and another the review tools on the same
    // route is worse than one that is consistently a review surface.
    expect(
      visibleProductViews({ product: { ownerId: "u1" }, viewerUserId: "u1", forceModerator: true }),
    ).toEqual(MODERATOR_SET);
  });

  it("survives a product shape it does not recognise", () => {
    // owner may arrive nested or missing entirely depending on which endpoint
    // loaded it; neither should throw or blank the page.
    expect(visibleProductViews({ product: { owner: { id: "u1" } }, viewerUserId: "u1" })).toEqual(SELLER_SET);
    expect(visibleProductViews({ product: null, viewerUserId: "u1" })).toEqual(MODERATOR_SET);
    expect(visibleProductViews({ product: undefined })).toEqual(SELLER_SET);
  });

  it("always includes overview and activity", () => {
    // Overview is where every route lands; activity answers "who changed
    // this", which is the moderator's main question.
    for (const opts of [
      { product: { ownerId: "u1" }, viewerUserId: "u1" },
      { product: { ownerId: "u1" }, viewerUserId: "other" },
      { product: { ownerId: "u1" }, forceModerator: true },
    ]) {
      const views = visibleProductViews(opts);
      expect(views).toContain("overview");
      expect(views).toContain("activity");
    }
  });
});

/**
 * The Ledger tab appears only when the host has a panel to put behind it.
 *
 * Both apps pass one; a host on an older pin should show one tab fewer rather
 * than a tab that opens onto nothing. This is the same guard that caught
 * "details" being added to the nav and not to the allowed set, which made
 * editing a product unreachable in production.
 */
describe("the ledger tab", () => {
    const owner = { ownerId: "u1", collaborators: [] };

    it("is absent when the host passes no panel", () => {
        expect(visibleProductViews({ product: owner, viewerUserId: "u1" }))
            .not.toContain("ledger");
    });

    it("appears, right after overview, when it does", () => {
        const views = visibleProductViews({ product: owner, viewerUserId: "u1", hasLedger: true });
        expect(views).toContain("ledger");
        // Money sits beside the numbers it explains, before the forms.
        expect(views.indexOf("ledger")).toBe(views.indexOf("overview") + 1);
    });

    /*
     * A moderator sees the item, not its money. Their set is overview +
     * activity and the ledger must not slip in behind the flag.
     */
    it("stays out of the moderator set even when a panel is passed", () => {
        expect(visibleProductViews({ product: owner, forceModerator: true, hasLedger: true }))
            .not.toContain("ledger");
    });
});
