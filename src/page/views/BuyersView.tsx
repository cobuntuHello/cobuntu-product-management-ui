"use client";

import * as React from "react";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { useCanEdit } from "../../lib/manageAccess";
import {
    PersonPickerModal, ResponsiveDrawer,
    userIdsOf, recipientsToApi, perRecipientMessages,
    type Recipient, type PersonPickerTierStep,
} from "@cobuntu/management-ui-shared";
import { ModalShell } from "../helpers";

/**
 * Who has this product, and who was asked to buy it.
 *
 * ── Two actions that are NOT the same feature ───────────────────────────────
 *
 * GIVE ACCESS hands the product over for free. Not a sale: no commission, no
 * ledger row, no Stripe. Revocable.
 *
 * INVITE TO BUY sends an email. They still pay — accepting a priced product
 * returns `needs_payment` and routes to checkout, exactly as accepting an
 * invitation to a paid event does.
 *
 * They differ in the one respect that matters, whether money moves, which is
 * why they are two buttons and not one with a toggle. A single control with a
 * "free?" checkbox is how a paid product gets given away by a mis-click.
 *
 * ── Both use the same picker as Hosts and Collaborators ─────────────────────
 *
 * Step one is the community roster; only the second step differs — consequences
 * for the grant, a note and an email preview for the invitation. Four surfaces,
 * one component, which is the point: the previous co-seller modal was a
 * separate implementation and had never worked.
 *
 *   GET    /products/:id/access-grants
 *   POST   /products/:id/access-grants        { userIds }
 *   DELETE /products/:id/access-grants/:userId
 *   GET    /products/:id/invitations
 *   POST   /products/:id/invitations          { usertags, emails, customMessage }
 *   DELETE /products/:id/invitations/:invitationId
 */

interface Grant {
    id: string;
    userId: string;
    note?: string | null;
    createdAt: string;
    users?: { id: string; name?: string | null; usertag?: string | null; profileImage?: string | null } | null;
}

interface Invitation {
    id: string;
    email: string;
    status: string;
    sendCount: number;
    invitedAt: string;
    users?: { id: string; name?: string | null; usertag?: string | null; profileImage?: string | null } | null;
}

/**
 * Someone who actually ACQUIRED this product themselves — free or paid.
 *
 * Neither a grant (the seller gave it away) nor an invitation (asked to pay,
 * still pending): this is a real checkout, which is why it needs its own
 * section. A free one is the bug this closes — it used to appear nowhere but
 * a €0.00 line on the Ledger tab.
 */
interface Customer {
    id: string;
    grossAmount: number;
    currency: string;
    createdAt: string;
    guestEmail: string | null;
    user: { id: string; name?: string | null; usertag?: string | null; profileImage?: string | null } | null;
}

/**
 * One customer's download usage vs. cap, and the licence if the tier carries
 * one — fetched lazily, per row, when a seller expands it. "How many
 * downloads from how many possible" was the exact ask; a cap of `null` means
 * unlimited (a stray 0/negative value on the tier reads the same way).
 */
interface CustomerDetail {
    licenseTerms: string | null;
    downloads: { name: string; used: number; max: number | null }[];
    linkOpens: { name: string; opens: number }[];
}

export function BuyersView({
    product,
    onUpdate,
    showToast,
    canEdit = true,
    communityTag,
    currentUserId,
}: {
    product: any;
    onUpdate: () => void | Promise<void>;
    showToast: (msg: string) => void;
    canEdit?: boolean;
    communityTag?: string | null;
    currentUserId?: string | null;
}) {
    const { apiBaseUrl, authHeaders, UserAvatar: ConfigAvatar } = useProductManagementConfig();
    const jsonHeaders = useJsonHeaders();
    const UserAvatar = ConfigAvatar ?? UserAvatarFallback;

    const [grants, setGrants] = React.useState<Grant[] | null>(null);
    const [invites, setInvites] = React.useState<Invitation[] | null>(null);
    const [customers, setCustomers] = React.useState<Customer[] | null>(null);
    /** The customer whose download/licence detail is open in the drawer, if any. */
    const [detailCustomer, setDetailCustomer] = React.useState<Customer | null>(null);
    /* Keyed by sale id. "loading"/"error" are states, not data — kept in the
       same map rather than a parallel one so there is one source of truth per
       row and no risk of the two falling out of sync. */
    const [customerDetails, setCustomerDetails] = React.useState<Record<string, CustomerDetail | "loading" | "error">>({});
    const [mode, setMode] = React.useState<null | "grant" | "invite">(null);
    const [confirmRevoke, setConfirmRevoke] = React.useState<Grant | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /*
     * Both signals, and-ed — the same gate Collaborators uses. Giving a product
     * away changes who has it without anyone paying, so a leader of a community
     * that merely CARRIES this product does not get to decide it.
     */
    const pageAllowsEditing = useCanEdit();
    const mayEdit = canEdit && pageAllowsEditing;

    const load = React.useCallback(async () => {
        const headers = authHeaders();
        const [g, i, c] = await Promise.all([
            fetch(`${apiBaseUrl}/api/products/${product.id}/access-grants`, { headers })
                .then((r) => (r.ok ? r.json() : [])).catch(() => []),
            fetch(`${apiBaseUrl}/api/products/${product.id}/invitations`, { headers })
                .then((r) => (r.ok ? r.json() : [])).catch(() => []),
            fetch(`${apiBaseUrl}/api/products/${product.id}/customers`, { headers })
                .then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        setGrants(Array.isArray(g) ? g : []);
        setInvites(Array.isArray(i) ? i : []);
        setCustomers(Array.isArray(c) ? c : []);
    }, [apiBaseUrl, authHeaders, product.id]);

    React.useEffect(() => { load(); }, [load]);

    /**
     * Open a customer's download/licence detail in the drawer, fetched once
     * and cached in `customerDetails` — reopening the same customer does not
     * re-fetch. This used to expand the row in place; every row below it
     * shoved down the page, and a data panel (several download-usage lines
     * plus a licence paragraph) crammed into an indented strip under a list
     * row read cramped no matter how it was styled.
     */
    const openCustomer = React.useCallback(async (customer: Customer) => {
        setDetailCustomer(customer);
        if (customerDetails[customer.id] !== undefined) return;
        setCustomerDetails((d) => ({ ...d, [customer.id]: "loading" }));
        try {
            const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/customers/${customer.id}`, { headers: authHeaders() });
            if (!res.ok) throw new Error(String(res.status));
            const body = await res.json();
            setCustomerDetails((d) => ({ ...d, [customer.id]: body }));
        } catch {
            setCustomerDetails((d) => ({ ...d, [customer.id]: "error" }));
        }
    }, [apiBaseUrl, authHeaders, product.id, customerDetails]);

    /** Everyone who already has it or has been asked — never offered again. */
    const excludeUserIds = React.useMemo(() => [
        ...(grants ?? []).map((g) => g.userId),
        ...(invites ?? []).map((i) => i.users?.id).filter((x): x is string => !!x),
        ...(customers ?? []).map((c) => c.user?.id).filter((x): x is string => !!x),
        ...(product?.ownerId ? [product.ownerId] : []),
    ], [grants, invites, customers, product?.ownerId]);

    /*
     * Which variant is being given away.
     *
     * Stock lives on the variant — giving away a Large is not giving away a
     * Small — and since a grant now consumes that variant's stock, the seller
     * has to say which one. Invitations below deliberately have no tier step:
     * an invitation is to the product, and the buyer picks a variant at
     * checkout.
     *
     * Feature-detected on the payload for the same reason the events modal is:
     * `remaining` only arrives once the tier-bound-capacity backend is
     * deployed, and presenting an unknown as "no limit" is the mistake that
     * had the public API reporting every tier available forever.
     */
    const variants: any[] = product?.tiers || [];
    const hasStockInfo = variants.length > 0
        && variants.every((t) => typeof t?.remaining === "number" || t?.remaining === null);

    const tierStep: PersonPickerTierStep | undefined = hasStockInfo ? {
        tiers: variants.map((t) => ({
            id: t.id,
            name: t.name,
            remaining: typeof t.remaining === "number" ? t.remaining : null,
            soldOut: typeof t.remaining === "number" && t.remaining <= 0,
        })),
        copy: {
            stepLabel: "Choose a variant",
            subtitle: "Which one are you giving away? This uses up that variant's stock.",
            remaining: (n) => `${n} left`,
            unlimited: "No limit",
            soldOut: "Out of stock",
            allFull: "Every variant is out of stock. Add stock to give one away.",
            summary: (n, name) => `${n} going to ${name}`,
            overBy: (n, name) => `${n} more than ${name} has left.`,
            importPreviewTitle: "Check this import",
            importReady: (n) => `${n} ${n === 1 ? "row" : "rows"} will be added.`,
            importProblems: (n) => `${n} ${n === 1 ? "row" : "rows"} cannot be added.`,
            problemUnknownTier: (name) => `No variant called "${name}"`,
            problemNoTier: "No variant chosen",
            problemTierFull: "That variant is out of stock",
            importConfirm: "Give these",
            importCancel: "Discard import",
        },
    } : undefined;

    async function giveAccess(recipients: Recipient[]) {
        /* Keyed by user id, unlike invitations: a grant writes a row against
           an account, so this picker is mounted without `emails` and there is
           nobody here without one. */
        const userIds = userIdsOf(recipients);
        if (userIds.length === 0) throw new Error("Choose at least one person.");
        /* Per person, because an imported list can mix variants. The server
           checks every id belongs to this product and refuses otherwise. */
        const tierAssignments = recipients
            .filter((r) => r.id && r.tierId)
            .map((r) => ({ userId: r.id!, tierId: r.tierId! }));
        const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/access-grants`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({
                userIds,
                tierAssignments: tierAssignments.length > 0 ? tierAssignments : undefined,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            if (res.status === 403) throw new Error("You don't have permission to manage this product.");
            throw new Error(body?.error || `Could not give access (${res.status})`);
        }
        /*
         * The endpoint reports per-person outcomes rather than failing the
         * batch, so a partial result has to be SAID. Silently claiming five
         * when three landed is worse than the failure.
         */
        const body = await res.json().catch(() => ({ granted: userIds, failed: [] }));
        if (Array.isArray(body.failed) && body.failed.length > 0) {
            throw new Error(`${body.granted?.length ?? 0} added, ${body.failed.length} could not be.`);
        }
    }

    async function sendInvites(recipients: Recipient[], message: string | null) {
        const { usertags, emails } = recipientsToApi(recipients);
        if (usertags.length === 0 && emails.length === 0) {
            throw new Error("Choose at least one person.");
        }
        const overrides = perRecipientMessages(recipients);
        const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/invitations`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({
                usertags: usertags.length > 0 ? usertags : undefined,
                emails: emails.length > 0 ? emails : undefined,
                customMessage: message || undefined,
                perRecipientMessages: overrides.length > 0 ? overrides : undefined,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            if (res.status === 403) throw new Error("You don't have permission to manage this product.");
            throw new Error(body?.error || `Could not send invitations (${res.status})`);
        }
    }

    async function revoke(g: Grant) {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/access-grants/${g.userId}`, {
                method: "DELETE", headers: authHeaders(),
            });
            if (res.ok) {
                await load();
                await onUpdate();
                showToast("Access removed");
                setConfirmRevoke(null);
            } else {
                setError("Could not remove that access");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            {/* No "Buyers" title/subtitle here — the tab itself is already
                labelled "Buyers" in the nav, so a repeat heading right below
                it said nothing new. Each action button now sits beside the
                title of the section it actually acts on, rather than grouped
                together above all three sections where neither read as
                belonging to one in particular. */}
            <Section title="Customers" count={customers?.length} subtitle="Bought it themselves — free or paid.">
                {customers === null ? (
                    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden"><p className="px-6 py-10 text-center text-[12px] text-zinc-400">Loading…</p></div>
                ) : customers.length === 0 ? (
                    <CompactEmptyRow
                        icon={<PeopleIcon />}
                        title="Nobody has bought this yet"
                        hint="Free or paid checkouts show up here."
                    />
                ) : (
                    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
                    <ul className="divide-y divide-zinc-100">
                        {customers.map((c) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => void openCustomer(c)}
                                    className="flex w-full items-center gap-3 px-5 py-3 text-left cursor-pointer hover:bg-zinc-50"
                                >
                                    <UserAvatar user={c.user ?? { id: c.guestEmail ?? c.id }} className="w-8 h-8 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] text-zinc-900 truncate">{c.user?.name || c.guestEmail || "Unknown"}</p>
                                        {c.user?.usertag ? (
                                            <p className="text-[11px] text-zinc-400 truncate">@{c.user.usertag}</p>
                                        ) : c.user?.name && c.guestEmail ? (
                                            <p className="text-[11px] text-zinc-400 truncate">{c.guestEmail}</p>
                                        ) : null}
                                    </div>
                                    <span className="text-[12px] font-medium text-zinc-500 shrink-0">
                                        {formatCustomerAmount(c.grossAmount, c.currency)}
                                    </span>
                                    <ChevronRightIcon className="shrink-0 text-zinc-300" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    </div>
                )}
            </Section>

            <div className="mt-5">
            <Section
                title="Has access"
                count={grants?.length}
                subtitle="Given the product for free. Not a sale."
                action={mayEdit ? (
                    <button
                        onClick={() => setMode("grant")}
                        className="shrink-0 px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                    >
                        Give access
                    </button>
                ) : undefined}
            >
                {grants === null ? (
                    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden"><p className="px-6 py-10 text-center text-[12px] text-zinc-400">Loading…</p></div>
                ) : grants.length === 0 ? (
                    <CompactEmptyRow
                        icon={<PeopleIcon />}
                        title="Nobody has been given this yet"
                        hint="Hand somebody the product without charging them."
                    />
                ) : (
                    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
                    <ul className="divide-y divide-zinc-100">
                        {grants.map((g) => (
                            <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                                <UserAvatar user={g.users ?? { id: g.userId }} className="w-8 h-8 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] text-zinc-900 truncate">{g.users?.name || "Unknown"}</p>
                                    {g.users?.usertag && (
                                        <p className="text-[11px] text-zinc-400 truncate">@{g.users.usertag}</p>
                                    )}
                                </div>
                                {mayEdit && (
                                    <button
                                        onClick={() => setConfirmRevoke(g)}
                                        className="px-3 py-1.5 text-[12px] rounded-lg cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200 shrink-0"
                                    >
                                        Remove
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    </div>
                )}
            </Section>
            </div>

            <div className="mt-5">
                <Section
                    title="Invited"
                    count={invites?.length}
                    subtitle="Asked to buy it. They still pay."
                    action={mayEdit ? (
                        <button
                            onClick={() => setMode("invite")}
                            className="shrink-0 px-3 py-1.5 text-[12px] font-medium rounded-lg cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        >
                            Invite to buy
                        </button>
                    ) : undefined}
                >
                    {invites === null ? (
                        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden"><p className="px-6 py-10 text-center text-[12px] text-zinc-400">Loading…</p></div>
                    ) : invites.length === 0 ? (
                        <CompactEmptyRow
                            icon={<PeopleIcon />}
                            title="No invitations sent"
                            hint="They get an email with your note, and still pay."
                        />
                    ) : (
                        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
                        <ul className="divide-y divide-zinc-100">
                            {invites.map((i) => (
                                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                                    <UserAvatar user={i.users ?? { id: i.email }} className="w-8 h-8 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] text-zinc-900 truncate">{i.users?.name || i.email}</p>
                                        <p className="text-[11px] text-zinc-400 truncate">
                                            {i.email}
                                            {i.sendCount > 1 && ` · sent ${i.sendCount} times`}
                                        </p>
                                    </div>
                                    {/* Status as a muted word, not a coloured pill. */}
                                    <span className="text-[11.5px] text-zinc-400 shrink-0">
                                        {i.status === "ACCEPTED" ? "Accepted" : i.status === "CANCELLED" ? "Cancelled" : "Pending"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        </div>
                    )}
                </Section>
            </div>

            {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

            {/*
              * The identity (avatar, name, @usertag) is composed entirely
              * inside `title` rather than split across title/subtitle/
              * headerExtra. ResponsiveDrawer's generic slots give a plain
              * text line each; a buyer deserves the same avatar+name
              * treatment every other row in this tab already gets, which
              * needs them laid out together, not stacked in three separate
              * blocks.
              */}
            <ResponsiveDrawer
                open={!!detailCustomer}
                onClose={() => setDetailCustomer(null)}
                title={
                    detailCustomer ? (
                        <div className="flex items-center gap-3">
                            <UserAvatar
                                user={detailCustomer.user ?? { id: detailCustomer.guestEmail ?? detailCustomer.id }}
                                className="w-10 h-10 shrink-0"
                            />
                            <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-zinc-900">
                                    {detailCustomer.user?.name || detailCustomer.guestEmail || "Customer"}
                                </p>
                                {detailCustomer.user?.usertag && (
                                    <p className="truncate text-[11px] font-normal text-zinc-400">@{detailCustomer.user.usertag}</p>
                                )}
                            </div>
                        </div>
                    ) : undefined
                }
            >
                {(() => {
                    if (!detailCustomer) return null;
                    const detail = customerDetails[detailCustomer.id];
                    return (
                        <CustomerDownloadDetailPanel
                            customer={detailCustomer}
                            detail={detail === "loading" || detail === undefined || detail === "error" ? undefined : detail}
                            loading={detail === "loading" || detail === undefined}
                            failed={detail === "error"}
                        />
                    );
                })()}
            </ResponsiveDrawer>

            {mode === "grant" && (
                <PersonPickerModal
                    open
                    onClose={() => setMode(null)}
                    apiBaseUrl={apiBaseUrl}
                    authHeaders={authHeaders}
                    communityTag={communityTag ?? null}
                    excludeUserIds={excludeUserIds}
                    currentUserId={currentUserId ?? null}
                    UserAvatar={UserAvatar}
                    multiple
                    tierStep={tierStep}
                    copy={{
                        ...BASE_COPY,
                        title: "Give access",
                        pickedSubtitle: "They get the product free. This is not a sale.",
                        stepTwo: "Review",
                        confirm: "Give access",
                        confirming: "Giving access…",
                    }}
                    stepTwo={{
                        kind: "consequences",
                        items: [
                            "They get the product immediately, free. No payment is taken.",
                            "This is not a sale: no commission, and nothing appears in the ledger.",
                            "You can take the access away again later.",
                        ],
                    }}
                    onConfirm={giveAccess}
                    onAdded={async () => {
                        setMode(null);
                        await load();
                        await onUpdate();
                        showToast("Access given");
                    }}
                />
            )}

            {mode === "invite" && (
                <PersonPickerModal
                    open
                    onClose={() => setMode(null)}
                    apiBaseUrl={apiBaseUrl}
                    authHeaders={authHeaders}
                    communityTag={communityTag ?? null}
                    excludeUserIds={excludeUserIds}
                    currentUserId={currentUserId ?? null}
                    UserAvatar={UserAvatar}
                    multiple
                    /*
                     * Invitations reach people with no account, which is most
                     * of what inviting is for. The grant picker above has no
                     * equivalent: a grant writes a row against an account.
                     */
                    emails={{
                        addRow: (a) => `Invite ${a}`,
                        importCsv: "Import CSV",
                        imported: (n) => `Imported ${n} ${n === 1 ? "address" : "addresses"}.`,
                        importedNothing: "No email addresses in the first column of that file.",
                        importFailed: "That file could not be read.",
                    }}
                    copy={{
                        ...BASE_COPY,
                        title: "Invite to buy",
                        pickedSubtitle: "Write your note, then see exactly what lands in their inbox.",
                        stepTwo: "Write and preview",
                        confirm: "Send invitations",
                        confirming: "Sending…",
                        messageLabel: "Message to everyone",
                        messagePlaceholder: "Add a note. Anyone you write to individually gets theirs instead.",
                    }}
                    stepTwo={{
                        kind: "compose",
                        maxLength: 500,
                        perRecipient: {
                            personalize: "Write to them",
                            personalized: "Has their own message",
                            save: "Save",
                            cancel: "Discard",
                            placeholder: (name) => `Write to ${name} instead of the shared message`,
                        },
                        preview: (message) => (
                            <EmailPreview
                                productName={product?.name ?? "this product"}
                                price={product?.price ?? 0}
                                currency={product?.currency ?? "EUR"}
                                message={message}
                            />
                        ),
                    }}
                    onConfirm={sendInvites}
                    onAdded={async () => {
                        setMode(null);
                        await load();
                        await onUpdate();
                        showToast("Invitations sent");
                    }}
                />
            )}

            {confirmRevoke && (
                <ModalShell onClose={() => setConfirmRevoke(null)}>
                    <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Remove access?</h3>
                    <p className="text-[12px] text-zinc-500 mb-4">
                        {confirmRevoke.users?.name || "This person"} will no longer be able to open{" "}
                        {product?.name ?? "this product"}.
                        {" "}
                        {/* The thing an operator cannot know from the button alone. */}
                        If they also BOUGHT it, they keep it — removing a gift does not undo a sale.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setConfirmRevoke(null)}
                            className="px-4 py-2 text-[13px] rounded-lg cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => revoke(confirmRevoke)}
                            disabled={busy}
                            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
                        >
                            {busy ? "Removing…" : "Remove access"}
                        </button>
                    </div>
                </ModalShell>
            )}
        </div>
    );
}

/** Shared between both pickers so the two flows cannot drift in wording. */
const BASE_COPY = {
    searchSubtitle: "Search members of this community, or by email.",
    searchPlaceholder: "Search by name, @usertag or email",
    emptyHint: "No members to show.",
    searching: "Searching…",
    noMatches: "No matches.",
    unknown: "Unknown",
    consequencesTitle: "What happens next",
    stepOne: "Choose people",
    cancel: "Cancel",
    back: "Back",
    membersLabel: "Members",
    showingLabel: "Showing",
    allMembersLabel: "All members",
    selectedLabel: (n: number) => `${n} selected`,
    selectedTitle: "Selected",
    clearAll: "Clear all",
    remove: (name: string) => `Remove ${name}`,
};

function Section({
    title, count, subtitle, action, children,
}: { title: string; count?: number; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
    /* The card wrapper lives with the LIST now, not here: the compact empty
       row renders on its own (no box-in-box), while a populated list still
       gets its card. The caller decides which, so Section is just the
       titled container. The count sits beside the title so you can tell at
       a glance which of the three sections actually have anything in them,
       instead of having to open each one to find out.

       `action`, when given, sits on the SAME row as the title rather than
       grouped with other sections' actions somewhere above the page —
       "Give access" and "Invite to buy" used to sit together at the top,
       where neither read as belonging to the section it actually acts on. */
    return (
        <div>
            <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                        <h3 className="text-[13px] font-semibold text-zinc-900">{title}</h3>
                        {typeof count === "number" && (
                            <span className="text-[11.5px] font-medium text-zinc-400 tabular-nums">· {count}</span>
                        )}
                    </div>
                    <p className="text-[11.5px] text-zinc-400">{subtitle}</p>
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

/**
 * A single compact row in place of a 250px dashed box. Three of these
 * sections are very often empty (give-away and invite are opt-in actions,
 * not every product's default state), and a tall placeholder for each one
 * made the page mostly whitespace saying "nothing here" three times over.
 * This holds the same information at roughly the height of one populated
 * list row.
 *
 * No inline action: "Give access" and "Invite to buy" already sit in the
 * page header above every section, so a second copy of either button inside
 * its own empty row would be the exact same control twice on one screen —
 * confusing, and ambiguous for anything querying the page by that label.
 */
function CompactEmptyRow({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-200 px-5 py-3.5">
            <span className="shrink-0 text-zinc-300" aria-hidden="true">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-900">{title}</p>
                <p className="text-[11.5px] text-zinc-400 truncate">{hint}</p>
            </div>
        </div>
    );
}

/**
 * The customer row's amount — the real price, zero included. A genuine $0
 * acquisition (the bug this section exists to fix) still prints as a real
 * currency amount ("€0.00"), never the word "Free" — a figure in the
 * buyer's own currency is the one thing every other row here already shows,
 * and swapping to a word only on the zero case is the inconsistency.
 * Cents, like everywhere else on the platform.
 */
function formatCustomerAmount(grossAmount: number, currency: string): string {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 })
            .format(grossAmount / 100);
    } catch {
        return `${(grossAmount / 100).toFixed(2)} ${currency}`;
    }
}

/**
 * What the invitee will receive.
 *
 * The PRICE is here deliberately — an invitation is not a gift, and a preview
 * that hid what the email says would defeat the point of previewing it.
 */
function EmailPreview({
    productName, price, currency, message,
}: { productName: string; price: number; currency: string; message: string }) {
    // Cents, like everywhere else on the platform. Always a real currency
    // amount — zero included — never the word "Free".
    let priceLabel: string;
    try {
        priceLabel = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 })
            .format(Number(price) / 100);
    } catch {
        priceLabel = `${(Number(price) / 100).toFixed(2)} ${currency}`;
    }
    return (
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-zinc-100 bg-zinc-50 text-[11px] text-zinc-400">
                Email preview
            </div>
            <div className="p-3.5">
                <div className="h-10 rounded-md bg-gradient-to-r from-zinc-700 to-zinc-500 mb-2.5" />
                <p className="text-[13px] font-semibold text-zinc-900 m-0">{productName}</p>
                <p className="text-[12px] text-zinc-500 m-0 mt-0.5">{priceLabel}</p>
                {message.trim() && (
                    <p className="text-[12px] text-zinc-600 italic border-l-2 border-zinc-200 pl-2.5 mt-2.5 mb-0">
                        {message}
                    </p>
                )}
                <span className="inline-block mt-3 px-3 py-1.5 rounded-md bg-zinc-900 text-white text-[11.5px] font-medium">
                    View product
                </span>
            </div>
        </div>
    );
}

function PeopleIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

/** Row affordance for "opens a drawer" — a sideways chevron, not the
 *  downward one this used to use for in-place expand/collapse. */
function ChevronRightIcon({ className = "" }: { className?: string }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="m9 6 6 6-6 6" />
        </svg>
    );
}

/**
 * A customer's purchase amount/date, their download usage vs. cap, and the
 * tier's licence text if it carries one. "How many downloads from how many
 * possible, and the licence if applicable" was the exact ask; the amount and
 * date are added here so the drawer carries the same purchase-identity
 * weight the ledger's own sale drawer does, rather than opening straight
 * into a bare download list with no record of what was bought or when.
 */
function CustomerDownloadDetailPanel({
    customer, detail, loading, failed,
}: { customer: Customer; detail?: CustomerDetail; loading: boolean; failed: boolean }) {
    const purchasedAt = new Date(customer.createdAt).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
    });
    const nothing = !!detail && detail.downloads.length === 0 && detail.linkOpens.length === 0 && !detail.licenseTerms;

    return (
        <div className="space-y-6">
            {/* Amount + date — the same purchase-identity weight the ledger's
                own sale drawer gives a movement, so this doesn't read as a
                bare download list with no record of what was bought. */}
            <div>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900">
                    {formatCustomerAmount(customer.grossAmount, customer.currency)}
                </p>
                <p className="mt-1 text-[13px] text-zinc-400">{purchasedAt}</p>
            </div>

            <div>
                <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Downloads</h4>

                {loading ? (
                    <div className="h-20 animate-pulse rounded-lg bg-zinc-50" />
                ) : failed ? (
                    <p className="text-[12.5px] text-red-600">Could not load this customer's download detail.</p>
                ) : nothing ? (
                    <p className="text-[12.5px] text-zinc-400">No downloadable content on this sale.</p>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50/50">
                        {detail!.downloads.map((d, i) => (
                            <div
                                key={`dl-${i}`}
                                className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] ${i > 0 ? "border-t border-zinc-100" : ""}`}
                            >
                                <DownloadIcon />
                                <span className="min-w-0 flex-1 truncate text-zinc-700">{d.name}</span>
                                <span className="shrink-0 font-medium tabular-nums text-zinc-900">
                                    {d.max != null ? `${d.used} of ${d.max} downloads` : `${d.used} ${d.used === 1 ? "download" : "downloads"}`}
                                </span>
                            </div>
                        ))}
                        {detail!.linkOpens.map((l, i) => (
                            <div
                                key={`lo-${i}`}
                                className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] ${(detail!.downloads.length > 0 || i > 0) ? "border-t border-zinc-100" : ""}`}
                            >
                                <LinkIcon />
                                <span className="min-w-0 flex-1 truncate text-zinc-700">{l.name}</span>
                                <span className="shrink-0 font-medium tabular-nums text-zinc-900">
                                    opened {l.opens} {l.opens === 1 ? "time" : "times"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {detail?.licenseTerms && (
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[11.5px] leading-relaxed text-zinc-500">
                    <span className="font-medium text-zinc-600">Licence: </span>{detail.licenseTerms}
                </p>
            )}
        </div>
    );
}

function DownloadIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

function LinkIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
    );
}
