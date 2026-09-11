import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { BuyersView } from "../page/views/BuyersView";

/**
 * Two ways somebody ends up with a product, and they are not the same thing.
 *
 * ── The line these tests defend ─────────────────────────────────────────────
 *
 * A GRANT hands it over free: no money, no commission, nothing in the ledger.
 * An INVITATION asks them to buy it and they still pay. Collapsing the two is
 * how you give away every paid product you meant to advertise, so the two
 * flows post to different endpoints with different payload shapes, and that is
 * what is pinned here.
 *
 * The picker chrome belongs to PersonPickerModal and is tested there. What is
 * product-specific is which endpoint gets called, with what body.
 */

const PRODUCT = { id: "p1", name: "Meditation Library", ownerId: "u-own", price: 2400, currency: "EUR" };

/* A product with real variants, each carrying its own stock. */
const WITH_VARIANTS = {
    ...PRODUCT,
    tiers: [
        { id: "t-small", name: "Small", capacity: 5, remaining: 2 },
        { id: "t-large", name: "Large", capacity: 1, remaining: 0 },
    ],
};

const ROSTER = {
    method: "GET",
    url: /\/memberships/,
    body: {
        members: [
            { id: "u-ana", name: "Ana Neto", usertag: "ana-neto", email: "ana@example.com", profileImage: null, roleGroups: [] },
            { id: "u-bo", name: "Bo Silva", usertag: "bo-silva", email: "bo@example.com", profileImage: null, roleGroups: [] },
        ],
    },
};
/* The tab loads both lists on mount. Empty keeps the fixtures about the act,
   not about what is already there. */
const LISTS = [
    { method: "GET", url: /\/access-grants$/, body: [] },
    { method: "GET", url: /\/invitations$/, body: [] },
];

function renderView(routes: any[] = [], product: any = PRODUCT) {
    const fetchMock = mockFetch([...LISTS, ROSTER, ...routes]);
    renderWithConfig(
        <BuyersView
            product={product}
            onUpdate={vi.fn()}
            showToast={vi.fn()}
            communityTag="c"
            currentUserId="u-own"
        />,
    );
    return fetchMock;
}

/** The body POSTed to a given endpoint. */
function posted(fetchMock: ReturnType<typeof vi.fn>, match: RegExp) {
    const call = fetchMock.mock.calls.find(
        ([url, init]: any) => match.test(String(url)) && init?.method === "POST",
    );
    return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

beforeEach(() => vi.clearAllMocks());

describe("giving access", () => {
    it("posts user ids, because a grant is written against an account", async () => {
        const user = userEvent.setup();
        const fetchMock = renderView([
            { method: "POST", url: /\/access-grants$/, body: { granted: ["u-ana"], failed: [] } },
        ]);

        await user.click(await screen.findByText("Give access"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Review" }));
        // Two buttons carry the action's name: the one that opened the modal
        // and the one that performs it. The confirm is the later.
        await user.click(screen.getAllByRole("button", { name: "Give access" }).at(-1)!);

        await waitFor(() => expect(posted(fetchMock, /access-grants/)).toBeTruthy());
        expect(posted(fetchMock, /access-grants/)).toEqual({ userIds: ["u-ana"] });
    });

    it("offers nobody without an account, since there would be nothing to grant to", async () => {
        // The invite flow below deliberately does the opposite.
        const user = userEvent.setup();
        renderView();

        await user.click(await screen.findByText("Give access"));
        await screen.findByText("Ana Neto");
        await user.type(screen.getByPlaceholderText(/Search by name/), "outsider@example.com");
        await waitFor(() => expect(screen.getByText("No matches.")).toBeInTheDocument());
        expect(screen.queryByText(/^Invite outsider/)).not.toBeInTheDocument();
    });

    it("says so when only some of them landed", async () => {
        /*
         * The endpoint reports per-person outcomes rather than failing the
         * batch. Silently claiming five when three landed is worse than the
         * failure itself.
         */
        const user = userEvent.setup();
        renderView([
            { method: "POST", url: /\/access-grants$/, body: { granted: ["u-ana"], failed: ["u-bo"] } },
        ]);

        await user.click(await screen.findByText("Give access"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByText("Bo Silva"));
        await user.click(screen.getByRole("button", { name: "Review" }));
        // Two buttons carry the action's name: the one that opened the modal
        // and the one that performs it. The confirm is the later.
        await user.click(screen.getAllByRole("button", { name: "Give access" }).at(-1)!);

        expect(await screen.findByText("1 added, 1 could not be.")).toBeInTheDocument();
    });
});

describe("inviting to buy", () => {
    it("posts a member by handle, never also by address", async () => {
        // Both would be one person, two invitation rows and two emails.
        const user = userEvent.setup();
        const fetchMock = renderView([{ method: "POST", url: /\/invitations$/, body: { sent: 1 } }]);

        await user.click(await screen.findByText("Invite to buy"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        await waitFor(() => expect(posted(fetchMock, /invitations/)).toBeTruthy());
        const body = posted(fetchMock, /invitations/);
        expect(body.usertags).toEqual(["ana-neto"]);
        expect(body.emails).toBeUndefined();
    });

    it("reaches somebody with no account at all", async () => {
        // This is most of what inviting is for, and it is exactly what the
        // grant flow above must not do.
        const user = userEvent.setup();
        const fetchMock = renderView([{ method: "POST", url: /\/invitations$/, body: { sent: 1 } }]);

        await user.click(await screen.findByText("Invite to buy"));
        await screen.findByText("Ana Neto");
        await user.type(screen.getByPlaceholderText(/Search by name/), "outsider@example.com");
        await user.click(await screen.findByText("Invite outsider@example.com"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        await waitFor(() => expect(posted(fetchMock, /invitations/)).toBeTruthy());
        expect(posted(fetchMock, /invitations/).emails).toEqual(["outsider@example.com"]);
    });

    it("carries the shared note and one person's own note", async () => {
        const user = userEvent.setup();
        const fetchMock = renderView([{ method: "POST", url: /\/invitations$/, body: { sent: 2 } }]);

        await user.click(await screen.findByText("Invite to buy"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByText("Bo Silva"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));

        await user.type(screen.getByPlaceholderText(/Add a note/), "Thought of you");
        await user.click(screen.getAllByRole("button", { name: "Write to them" })[0]);
        await user.type(screen.getByPlaceholderText(/Write to Ana Neto/), "Yours is chapter three");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        await waitFor(() => expect(posted(fetchMock, /invitations/)).toBeTruthy());
        const body = posted(fetchMock, /invitations/);
        expect(body.customMessage).toBe("Thought of you");
        // Only Ana. Bo never wrote one, and an empty override would replace
        // his shared note with nothing.
        expect(body.perRecipientMessages).toEqual([
            { usertag: "ana-neto", message: "Yours is chapter three" },
        ]);
    });

    it("shows the price in the preview, because an invitation is not a gift", async () => {
        const user = userEvent.setup();
        renderView();

        await user.click(await screen.findByText("Invite to buy"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));

        // 2400 cents. A preview that hid what the email says would defeat the
        // point of previewing it.
        expect(await screen.findByText(/24/)).toBeInTheDocument();
    });

    it("keeps the staged list and shows why when the send fails", async () => {
        const user = userEvent.setup();
        renderView([
            { method: "POST", url: /\/invitations$/, status: 403, body: { error: "Nope." } },
        ]);

        await user.click(await screen.findByText("Invite to buy"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        expect(await screen.findByText("You don't have permission to manage this product."))
            .toBeInTheDocument();
    });
});

describe("giving away a specific variant", () => {
    it("sends the chosen variant with the grant", async () => {
        /*
         * Stock lives on the variant, and a grant consumes it. Giving away a
         * Large is not giving away a Small, so the endpoint has to be told
         * which shelf the unit came off.
         */
        const user = userEvent.setup();
        const fetchMock = renderView(
            [{ method: "POST", url: /\/access-grants$/, body: { granted: ["u-ana"], failed: [] } }],
            WITH_VARIANTS,
        );

        await user.click(await screen.findByText("Give access"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Choose a variant" }));
        // Small is the only one with stock, so it is already selected.
        await user.click(screen.getByRole("button", { name: "Review" }));
        await user.click(screen.getAllByRole("button", { name: "Give access" }).at(-1)!);

        await waitFor(() => expect(posted(fetchMock, /access-grants/)).toBeTruthy());
        expect(posted(fetchMock, /access-grants/).tierAssignments).toEqual([
            { userId: "u-ana", tierId: "t-small" },
        ]);
    });

    it("shows an out-of-stock variant without letting it be chosen", async () => {
        const user = userEvent.setup();
        renderView([], WITH_VARIANTS);

        await user.click(await screen.findByText("Give access"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Choose a variant" }));

        expect(screen.getByText("Large").closest("button")).toBeDisabled();
        expect(screen.getByText("Out of stock")).toBeInTheDocument();
        expect(screen.getByText("2 left")).toBeInTheDocument();
    });

    it("does not ask for a variant when INVITING", async () => {
        // An invitation is to the product. The buyer picks a variant at
        // checkout, so asking the seller to choose would be asking them to
        // decide something that is not theirs to decide.
        const user = userEvent.setup();
        renderView([], WITH_VARIANTS);

        await user.click(await screen.findByText("Invite to buy"));
        await user.click(await screen.findByText("Ana Neto"));

        expect(screen.getByRole("button", { name: "Write and preview" })).toBeInTheDocument();
        expect(screen.queryByText("Choose a variant")).not.toBeInTheDocument();
    });

    it("skips the step on a product with no variants", async () => {
        const user = userEvent.setup();
        const fetchMock = renderView(
            [{ method: "POST", url: /\/access-grants$/, body: { granted: ["u-ana"], failed: [] } }],
        );

        await user.click(await screen.findByText("Give access"));
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Review" }));
        await user.click(screen.getAllByRole("button", { name: "Give access" }).at(-1)!);

        await waitFor(() => expect(posted(fetchMock, /access-grants/)).toBeTruthy());
        expect(posted(fetchMock, /access-grants/).tierAssignments).toBeUndefined();
    });
});
