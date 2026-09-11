"use client";

import * as React from "react";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { useCanEdit } from "../../lib/manageAccess";
import {
    EmptyState, PersonPickerModal,
    userIdsOf, recipientsToApi, perRecipientMessages, type Recipient,
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
        const [g, i] = await Promise.all([
            fetch(`${apiBaseUrl}/api/products/${product.id}/access-grants`, { headers })
                .then((r) => (r.ok ? r.json() : [])).catch(() => []),
            fetch(`${apiBaseUrl}/api/products/${product.id}/invitations`, { headers })
                .then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        setGrants(Array.isArray(g) ? g : []);
        setInvites(Array.isArray(i) ? i : []);
    }, [apiBaseUrl, authHeaders, product.id]);

    React.useEffect(() => { load(); }, [load]);

    /** Everyone who already has it or has been asked — never offered again. */
    const excludeUserIds = React.useMemo(() => [
        ...(grants ?? []).map((g) => g.userId),
        ...(invites ?? []).map((i) => i.users?.id).filter((x): x is string => !!x),
        ...(product?.ownerId ? [product.ownerId] : []),
    ], [grants, invites, product?.ownerId]);

    async function giveAccess(recipients: Recipient[]) {
        /* Keyed by user id, unlike invitations: a grant writes a row against
           an account, so this picker is mounted without `emails` and there is
           nobody here without one. */
        const userIds = userIdsOf(recipients);
        if (userIds.length === 0) throw new Error("Choose at least one person.");
        const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/access-grants`, {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ userIds }),
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

    const isFree = Number(product?.price ?? 0) === 0;

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
                <div className="flex-1">
                    <h2 className="text-[15px] font-semibold text-zinc-900">Buyers</h2>
                    <p className="text-[12px] text-zinc-400 mt-0.5">
                        People you gave this to, and people you asked to buy it.
                    </p>
                </div>
                {mayEdit && (
                    <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                        <button
                            onClick={() => setMode("invite")}
                            className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium rounded-lg cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        >
                            Invite to buy
                        </button>
                        <button
                            onClick={() => setMode("grant")}
                            className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                        >
                            Give access
                        </button>
                    </div>
                )}
            </div>

            <Section title="Has access" subtitle="Given the product for free. Not a sale.">
                {grants === null ? (
                    <p className="px-6 py-10 text-center text-[12px] text-zinc-400">Loading…</p>
                ) : grants.length === 0 ? (
                    <EmptyState
                        bordered={false}
                        icon={<PeopleIcon />}
                        title="Nobody has been given this yet"
                        body="Give access to hand somebody the product without charging them."
                    />
                ) : (
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
                )}
            </Section>

            <div className="mt-5">
                <Section title="Invited" subtitle="Asked to buy it. They still pay.">
                    {invites === null ? (
                        <p className="px-6 py-10 text-center text-[12px] text-zinc-400">Loading…</p>
                    ) : invites.length === 0 ? (
                        <EmptyState
                            bordered={false}
                            icon={<PeopleIcon />}
                            title="No invitations sent"
                            body="Invite somebody to buy this and they get an email with your note."
                        />
                    ) : (
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
                    )}
                </Section>
            </div>

            {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

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
                                isFree={isFree}
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

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-2">
                <h3 className="text-[13px] font-semibold text-zinc-900">{title}</h3>
                <p className="text-[11.5px] text-zinc-400">{subtitle}</p>
            </div>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">{children}</div>
        </div>
    );
}

/**
 * What the invitee will receive.
 *
 * The PRICE is here deliberately — an invitation is not a gift, and a preview
 * that hid what the email says would defeat the point of previewing it.
 */
function EmailPreview({
    productName, price, currency, isFree, message,
}: { productName: string; price: number; currency: string; isFree: boolean; message: string }) {
    // Cents, like everywhere else on the platform.
    let priceLabel = "Free";
    if (!isFree) {
        try {
            priceLabel = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 })
                .format(Number(price) / 100);
        } catch {
            priceLabel = `${(Number(price) / 100).toFixed(2)} ${currency}`;
        }
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
