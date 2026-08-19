import { describe, it, expect } from "vitest";
import { visibleProductViews } from "../page/ProductManagePage";
import { SECTION_KEYS } from "../page/ProductSectionsNav";

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

    it("appears after details when it does", () => {
        const views = visibleProductViews({ product: owner, viewerUserId: "u1", hasLedger: true });
        expect(views).toEqual(["overview", "details", "ledger", "collaborators", "activity"]);
    });

    /*
     * The ORDER a person sees comes from SECTIONS in ProductSectionsNav, which
     * renders SECTIONS.filter(visible) -- this list decides WHETHER a tab shows,
     * that one decides WHERE. An earlier version of this test pinned the
     * position here and nowhere else, which pinned it in the list that does not
     * order anything.
     */
    it("is ordered after details in the nav, which is what decides", () => {
        const keys = SECTION_KEYS;
        expect(keys.indexOf("ledger")).toBe(keys.indexOf("details") + 1);
    });

    /*
     * A MODERATOR GETS IT TOO, and this is the line that matters.
     *
     * The reduced set exists because a moderator cannot EDIT, not because they
     * may not look. A community leader reviewing a member's product is a
     * moderator by this definition -- they are not the owner -- and they are
     * also the party the community column is for. Excluding them would hide
     * the ledger from exactly the person it was built to answer.
     */
    it("is offered to a moderator, alongside the other read-only tabs", () => {
        const views = visibleProductViews({ product: owner, forceModerator: true, hasLedger: true });
        expect(views).toEqual(["overview", "ledger", "activity"]);
    });

    it("is still absent for a moderator when no panel is passed", () => {
        expect(visibleProductViews({ product: owner, forceModerator: true }))
            .toEqual(["overview", "activity"]);
    });
});
