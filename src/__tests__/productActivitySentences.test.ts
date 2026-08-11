import { describe, it, expect } from "vitest";
import {
  renderProductActivitySentence,
  formatRelativeTime,
  type ProductActivityEntryForRender,
} from "../components/activity/productActivitySentences";

/**
 * The sentence renderer is where an audit log stops being data and starts
 * being a claim about what someone did. The tests below are the claims that
 * would be WRONG rather than merely ugly if the renderer slipped.
 */

function entry(over: Partial<ProductActivityEntryForRender>): ProductActivityEntryForRender {
  return {
    source: "PRODUCT_AUDIT",
    action: "PRODUCT_UPDATED",
    actor: { id: "u1", name: "Bea", usertag: "bea", profileImage: null },
    payload: {},
    ...over,
  };
}

describe("actor naming", () => {
  it("falls back to the usertag, then to Someone", () => {
    expect(renderProductActivitySentence(entry({ action: "PRODUCT_CREATED" })).text).toMatch(/^Bea /);
    expect(
      renderProductActivitySentence(
        entry({ action: "PRODUCT_CREATED", actor: { id: "u", name: "  ", usertag: "zed", profileImage: null } }),
      ).text,
    ).toMatch(/^zed /);
    // A deleted actor must not render "null created this product".
    expect(
      renderProductActivitySentence(entry({ action: "PRODUCT_CREATED", actor: null })).text,
    ).toMatch(/^Someone /);
  });
});

describe("withdrawal is never reported as a removal", () => {
  // Both are CANCELLED on the row. Saying a community removed a listing the
  // seller pulled themselves is a permanent, wrong record of a refusal.
  it("distinguishes the seller closing it from a leader taking it down", () => {
    const withdrawn = renderProductActivitySentence(
      entry({ action: "LISTING_REMOVED", payload: { closedBySeller: true, communityName: "Ave Park" } }),
    );
    const removed = renderProductActivitySentence(
      entry({ action: "LISTING_REMOVED", payload: { closedBySeller: false, communityName: "Ave Park" } }),
    );
    expect(withdrawn.text).toBe("Bea withdrew it in Ave Park");
    expect(removed.text).toBe("Bea removed it in Ave Park");
  });
});

describe("demotion says the purchase survives", () => {
  it("does not read as revoked access", () => {
    const s = renderProductActivitySentence(
      entry({ source: "COLLABORATOR_AUDIT", action: "DEMOTED_TO_BUYER", payload: { targetName: "Alice" } }),
    );
    expect(s.text).toContain("keep their purchase");
    expect(s.subjectName).toBe("Alice");
  });
});

describe("the re-review cause is on the entry that caused it", () => {
  it("says so when a material edit sent the listing back", () => {
    const s = renderProductActivitySentence(
      entry({ action: "PRODUCT_UPDATED", payload: { fields: ["price"], sentBackToReview: true } }),
    );
    expect(s.text).toBe("Bea edited the product (price), sending it back for review");
  });

  it("stays quiet when it did not", () => {
    const s = renderProductActivitySentence(
      entry({ action: "PRODUCT_UPDATED", payload: { fields: ["description"] } }),
    );
    expect(s.text).toBe("Bea edited the product (description)");
  });
});

describe("field lists read as English", () => {
  it("joins one, two, and many", () => {
    const t = (fields: string[]) =>
      renderProductActivitySentence(entry({ action: "PRODUCT_UPDATED", payload: { fields } })).text;
    expect(t([])).toBe("Bea edited the product");
    expect(t(["price"])).toBe("Bea edited the product (price)");
    expect(t(["price", "name"])).toBe("Bea edited the product (price and name)");
    expect(t(["price", "name", "description"])).toBe("Bea edited the product (price, name, and description)");
  });
});

describe("commission rates", () => {
  it("reads a fraction as a percentage and leaves a percentage alone", () => {
    const t = (commissionRate: number) =>
      renderProductActivitySentence(entry({ action: "LISTING_REQUESTED", payload: { commissionRate } })).text;
    expect(t(0.15)).toContain("15% commission");
    expect(t(15)).toContain("15% commission");
    expect(t(0)).toContain("0% commission");
  });
});

describe("missing payload data degrades instead of lying", () => {
  it("omits the community rather than printing undefined", () => {
    expect(renderProductActivitySentence(entry({ action: "LISTING_HIDDEN", payload: {} })).text).toBe(
      "Bea hid it from the storefront",
    );
    expect(renderProductActivitySentence(entry({ action: "LISTING_HIDDEN", payload: null })).text).toBe(
      "Bea hid it from the storefront",
    );
  });

  it("renders an unknown action generically rather than blank", () => {
    // A backend ahead of this bundle must not empty the tab.
    expect(renderProductActivitySentence(entry({ action: "SOMETHING_NEW" })).text).toBe("Bea updated the product");
    expect(
      renderProductActivitySentence(entry({ source: "COLLABORATOR_AUDIT", action: "SOMETHING_NEW", payload: {} })).text,
    ).toBe("Bea updated co-sellers");
  });
});

describe("the two vocabularies do not collide", () => {
  it("reads ADDED as a co-seller only on a collaborator row", () => {
    expect(
      renderProductActivitySentence(
        entry({ source: "COLLABORATOR_AUDIT", action: "ADDED", payload: { targetName: "Alice" } }),
      ).text,
    ).toBe("Bea added Alice as a co-seller");
    // Same action string, other table → the generic fallback, not a co-seller
    // sentence about a person who is not in the payload.
    expect(renderProductActivitySentence(entry({ source: "PRODUCT_AUDIT", action: "ADDED" })).text).toBe(
      "Bea updated the product",
    );
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("walks the units", () => {
    expect(formatRelativeTime(ago(5_000), now)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5m ago");
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(formatRelativeTime(ago(3 * 86_400_000), now)).toBe("3d ago");
  });

  it("switches to a date once relative stops being placeable", () => {
    // "47d ago" is not a date anyone can locate.
    expect(formatRelativeTime(ago(47 * 86_400_000), now)).not.toMatch(/ago/);
  });

  it("returns the raw value rather than Invalid Date", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("not-a-date");
  });
});
