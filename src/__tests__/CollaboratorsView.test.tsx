import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { CollaboratorsView } from "../page/views/CollaboratorsView";

/**
 * Co-sellers, rebuilt to the events Hosts pattern.
 *
 * The three things that pattern fixes, and which the old view got wrong:
 *   1. the add control belongs in the section HEADER, not floating above the list
 *   2. a destructive action needs a CONFIRMATION step
 *   3. the operator must be told what removal actually costs the person —
 *      someone who bought this product KEEPS their purchase, which the old
 *      "Remove" link never said
 */

const OWNER = { id: "c-own", userId: "u-own", role: "OWNER", user: { id: "u-own", name: "Bea Owner", usertag: "bea" } };
const MATE = { id: "c-2", userId: "u-2", role: "COLLABORATOR", user: { id: "u-2", name: "Ana Mate", usertag: "ana" } };
const BUYER = { id: "c-3", userId: "u-3", role: "COLLABORATOR", hasPurchased: true, user: { id: "u-3", name: "Cy Buyer", usertag: "cy" } };

const product = { id: "p1", ownerId: "u-own", communityId: null };

function renderView(rows: any[], over: Record<string, any> = {}) {
  mockFetch([{ method: "GET", url: /\/collaborators$/, body: rows }, ...(over.routes || [])]);
  return renderWithConfig(
    <CollaboratorsView
      product={product}
      onUpdate={vi.fn()}
      showToast={vi.fn()}
      {...over}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("the header", () => {
  it("puts the action in the header, not above the list", async () => {
    renderView([OWNER]);
    expect(await screen.findByText("Co-sellers")).toBeInTheDocument();
    expect(screen.getByText("Add member")).toBeInTheDocument();
    // The old bare input is gone from the page body.
    expect(screen.queryByPlaceholderText("@usertag")).not.toBeInTheDocument();
  });

  it("hides the action from a moderator", async () => {
    // A moderator reviewing someone else's listing does not rewrite who sells it.
    renderView([OWNER], { canEdit: false });
    await screen.findByText("Co-sellers");
    expect(screen.queryByText("Add member")).not.toBeInTheDocument();
  });

  it("says the owner is immutable on a user-owned product", async () => {
    renderView([OWNER]);
    expect(await screen.findByText(/owner is immutable/i)).toBeInTheDocument();
  });
});

describe("the rows", () => {
  it("locks the owner with a badge and no action", async () => {
    renderView([OWNER]);
    expect(await screen.findByText("Owner")).toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("offers one inline action per co-seller, not a kebab", async () => {
    renderView([OWNER, MATE]);
    expect(await screen.findByText("Remove")).toBeInTheDocument();
    expect(screen.queryByLabelText(/more|options/i)).not.toBeInTheDocument();
  });

  it("says DEMOTE for someone who bought the product", async () => {
    // Removing a buyer-collaborator does not evict them; the label should not
    // imply it does.
    renderView([OWNER, BUYER]);
    expect(await screen.findByText("Demote to buyer")).toBeInTheDocument();
  });

  it("shows an empty state, not a bare card", async () => {
    renderView([]);
    expect(await screen.findByText("No co-sellers yet")).toBeInTheDocument();
  });
});

describe("removal is confirmed, and explains itself", () => {
  it("does NOT delete on the first click", async () => {
    const fn = mockFetch([{ method: "GET", url: /\/collaborators$/, body: [OWNER, MATE] }]);
    renderWithConfig(<CollaboratorsView product={product} onUpdate={vi.fn()} showToast={vi.fn()} />);
    await userEvent.click(await screen.findByText("Remove"));
    expect(fn.mock.calls.some((c) => (c[1] as any)?.method === "DELETE")).toBe(false);
  });

  it("tells a buyer-collaborator they keep what they paid for", async () => {
    renderView([OWNER, BUYER]);
    await userEvent.click(await screen.findByText("Demote to buyer"));
    expect(await screen.findByText(/keeps everything already purchased/i)).toBeInTheDocument();
  });

  it("switches to the second person when you remove YOURSELF", async () => {
    renderView([OWNER, MATE], { currentUserId: "u-2" });
    await userEvent.click(await screen.findByText("Remove"));
    expect(await screen.findByText(/Remove yourself\?/i)).toBeInTheDocument();
    expect(screen.getByText(/^You lose/)).toBeInTheDocument();
  });

  it("deletes only after confirming", async () => {
    const fn = mockFetch([
      { method: "GET", url: /\/collaborators$/, body: [OWNER, MATE] },
      { method: "DELETE", url: /\/collaborators\/u-2$/, body: {} },
    ]);
    renderWithConfig(<CollaboratorsView product={product} onUpdate={vi.fn()} showToast={vi.fn()} />);
    await userEvent.click(await screen.findByText("Remove"));
    // The row action and the modal's confirm share the label — deliberately,
    // since the confirm restates the verb. Take the LAST, which is the one the
    // modal just rendered.
    await screen.findByText(/Remove Ana Mate\?/);
    const buttons = screen.getAllByRole("button", { name: "Remove" });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(fn.mock.calls.some((c) => (c[1] as any)?.method === "DELETE")).toBe(true),
    );
  });
});

describe("adding a co-seller — the flow that had never worked", () => {
  /*
   * The add modal posted `{ usertag }`, typed by hand, to an endpoint that
   * reads `req.body?.userId` and 400s without it. Every attempt from admin
   * failed with "userId is required".
   *
   * Nothing caught it because this suite covered GET and DELETE and never the
   * add BODY — so that is the assertion that matters here, not the markup.
   */
  const MEMBER = { id: "u-9", name: "Nia New", usertag: "nia", profileImage: null };

  function renderForAdd(extraRoutes: any[] = []) {
    const fn = mockFetch([
      { method: "GET", url: /\/collaborators$/, body: [OWNER] },
      // The picker browses the community now; search is the fallback when the
      // roster has nothing for the query.
      { method: "GET", url: /\/memberships/, body: { members: [{ ...MEMBER, roleGroups: [] }] } },
      { method: "GET", url: /\/members\/search/, body: { members: [MEMBER] } },
      ...extraRoutes,
    ]);
    renderWithConfig(
      <CollaboratorsView
        product={product}
        onUpdate={vi.fn()}
        showToast={vi.fn()}
        communityTag="pbn"
      />,
    );
    return fn;
  }

  /*
   * Two steps now: choose, then review. The consequences pane sits between the
   * pick and the write ON PURPOSE — granting management access to somebody
   * else's product should state what it does before it does it — so the test
   * walks the same path an operator does.
   */
  async function pickNia() {
    await userEvent.click(await screen.findByText("Add member"));
    await userEvent.click(await screen.findByText("Nia New"));
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
  }

  it("POSTs userId — not usertag", async () => {
    const fn = renderForAdd([{ method: "POST", url: /\/collaborators$/, body: { ok: true } }]);
    await pickNia();
    await userEvent.click(screen.getByRole("button", { name: "Add co-seller" }));

    await waitFor(() => {
      const post = fn.mock.calls.find(
        ([, init]: any) => (init?.method || "").toUpperCase() === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(post![1].body)).toEqual({ userId: "u-9" });
    });
  });

  it("browses the community instead of asking for an exact tag", async () => {
    /*
     * This used to assert that typing hit /members/search. It does not any
     * more, and that is the improvement rather than a regression: the roster is
     * on screen before anything is typed, so the common case needs no query at
     * all. Search survives as the fallback for somebody the roster does not
     * hold — covered in the picker's own tests.
     */
    const fn = renderForAdd();
    await userEvent.click(await screen.findByText("Add member"));

    await waitFor(() => {
      expect(fn.mock.calls.some(([u]: any) => String(u).includes("/memberships"))).toBe(true);
    });
    expect(await screen.findByText("Nia New")).toBeInTheDocument();
    expect(fn.mock.calls.some(([u]: any) => String(u).includes("/members/search"))).toBe(false);
  });

  it("excludes people already on the bench, so they cannot be picked at all", async () => {
    // The owner is already a co-seller, so he must not be offered. Exclusion
    // applies to the ROSTER now rather than being pushed to a search endpoint,
    // which is why this asserts on what renders instead of on a query string.
    mockFetch([
      { method: "GET", url: /\/collaborators$/, body: [OWNER] },
      {
        method: "GET", url: /\/memberships/,
        body: { members: [
          { ...MEMBER, roleGroups: [] },
          { id: OWNER.userId, name: "Bea Owner", usertag: "bea", roleGroups: [] },
        ] },
      },
    ]);
    renderWithConfig(
      <CollaboratorsView product={product} onUpdate={vi.fn()} showToast={vi.fn()} communityTag="pbn" />,
    );
    await userEvent.click(await screen.findByText("Add member"));

    // Scoped to the picker: "Bea Owner" is also the owner ROW in the list
    // behind the modal, so an unscoped query would pass or fail for the wrong
    // reason either way.
    const picker = await screen.findByRole("dialog");
    expect(await within(picker).findByText("Nia New")).toBeInTheDocument();
    expect(within(picker).queryByText("Bea Owner")).not.toBeInTheDocument();
  });

  it("shows what it will do before it does it", async () => {
    renderForAdd([{ method: "POST", url: /\/collaborators$/, body: { ok: true } }]);
    await pickNia();
    expect(screen.getByText("What happens next")).toBeInTheDocument();
    // "Payouts still go to the owner" also appears in the section subtitle,
    // so assert on the half that only the consequence list carries.
    expect(screen.getByText(/No money changes hands/i)).toBeInTheDocument();
  });

  it("keeps the pick and explains a 409 instead of dropping back to search", async () => {
    renderForAdd([{ method: "POST", url: /\/collaborators$/, status: 409, body: { error: "nope" } }]);
    await pickNia();
    await userEvent.click(screen.getByRole("button", { name: "Add co-seller" }));

    expect(await screen.findByText(/already a co-seller/i)).toBeInTheDocument();
    expect(screen.getByText("Nia New")).toBeInTheDocument();
  });

  it("falls back to global search for a product no community owns", async () => {
    const fn = mockFetch([
      { method: "GET", url: /\/collaborators$/, body: [OWNER] },
      { method: "GET", url: /\/discovery\/users/, body: { data: [MEMBER] } },
    ]);
    renderWithConfig(
      <CollaboratorsView product={product} onUpdate={vi.fn()} showToast={vi.fn()} communityTag={null} />,
    );
    await userEvent.click(await screen.findByText("Add member"));
    await userEvent.type(await screen.findByPlaceholderText(/search by name/i), "nia");

    await waitFor(() => {
      const search = fn.mock.calls.find(([url]: any) => String(url).includes("/discovery/users"));
      expect(search).toBeTruthy();
    });
  });
});
