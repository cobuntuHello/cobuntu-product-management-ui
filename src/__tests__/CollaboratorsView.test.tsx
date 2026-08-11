import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
