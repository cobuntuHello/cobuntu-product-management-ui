"use client";

import * as React from "react";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { ModalShell } from "../helpers";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { useCanEdit } from "../../lib/manageAccess";
import {
  EmptyState, PersonPickerModal, userIdsOf, type Recipient,
} from "@cobuntu/management-ui-shared";

/**
 * Co-sellers — the product twin of the event page's Hosts tab, built to the
 * same pattern rather than merely doing the same job.
 *
 * WHAT IT WAS: a bare "@usertag" input above the list, each row with a plain
 * "Remove" link that issued the DELETE immediately. Three things were wrong,
 * and the events side had already fixed all three:
 *
 *   1. The add control sat above the list instead of in the section header,
 *      inconsistent with every other management surface.
 *   2. A destructive action with no confirmation step.
 *   3. No way for the operator to know what removal actually DOES. Removing
 *      someone who bought this product does not take their purchase away —
 *      the backend records that as DEMOTED_TO_BUYER — but the row said only
 *      "Remove", so the operator was guessing.
 *
 * Now: header with title + subtitle left and the action right; rows with one
 * always-visible inline action (no kebab — wrong affordance for a row with
 * exactly one); a confirm modal whose copy changes with who is being removed
 * and what it will actually cost them.
 *
 * The backend has had this since feat/product-sellers-card:
 *   GET    /products/:id/collaborators
 *   POST   /products/:id/collaborators        { userId }
 *   DELETE /products/:id/collaborators/:userId
 *
 * and canManageProduct has always admitted collaborators. Nothing surfaced it,
 * so the only way to add a co-seller was through the API. The product detail
 * page already STACKS them as co-sellers; this is where they come from.
 *
 * THAT POST LINE USED TO READ `{ usertag }`, and it was wrong. The code was
 * written to match the comment: a bare "@usertag" box posting a field the
 * controller never reads, answering `400 userId is required` on every attempt.
 * Adding a co-seller from admin had never worked, and the suite covered GET
 * and DELETE but never this body, so nothing said so.
 *
 * The add flow is the shared PersonPickerModal now — the same component the
 * events Hosts tab uses — so the id comes back from the server and cannot be
 * mistyped.
 *
 * THE OWNER ROW IS NOT REMOVABLE. product_collaborators carries a row for the
 * owner too — that is how canManageProduct answers for them — and deleting it
 * would strip the owner of their own product. The endpoint would likely allow
 * it; the UI does not offer it.
 */

interface Collaborator {
  id: string;
  userId: string;
  role?: string | null;
  user?: { id: string; name?: string | null; usertag?: string | null; profileImage?: string | null } | null;
  /** Set when this person has bought the product — removal demotes, not evicts. */
  hasPurchased?: boolean;
}

export function CollaboratorsView({
  product,
  onUpdate,
  showToast,
  canEdit = true,
  currentUserId,
  communityTag,
}: {
  product: any;
  onUpdate: () => void | Promise<void>;
  showToast: (msg: string) => void;
  /**
   * A MODERATOR reviewing someone else's listing should not be re-writing who
   * sells it. Sellers manage their own bench.
   */
  canEdit?: boolean;
  /** Lets the confirm copy switch to the second person on self-removal. */
  currentUserId?: string | null;
  /**
   * Whose members to search when adding. Null for a product no community owns,
   * which falls back to global user search — see searchPeople.
   */
  communityTag?: string | null;
}) {
  const { apiBaseUrl, authHeaders, UserAvatar: ConfigAvatar } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;

  const [rows, setRows] = React.useState<Collaborator[] | null>(null);
  const [addOpen, setAddOpenState] = React.useState(false);
  const [confirmRemove, setConfirmRemoveState] = React.useState<Collaborator | null>(null);
  /*
   * Adding or removing a co-seller changes who gets paid. A leader of a
   * community that merely CARRIES this product does not get to decide that.
   *
   * This view has no shared modal state -- it opens its own -- which is
   * exactly the shape that was missed on the event side, so it is gated
   * explicitly here.
   */
  /*
   * BOTH signals, and-ed. The `canEdit` PROP already existed and says whether
   * this particular viewer may manage co-sellers; the context says whether the
   * whole page is read-only. Either one saying no means no -- taking only the
   * prop would let a carrying community's leader through, and taking only the
   * context would quietly widen whatever the prop was protecting.
   */
  // The hook is called UNCONDITIONALLY. Written as `canEdit && useCanEdit()`
  // it would be skipped whenever the prop is false -- a conditional hook, and
  // React tears the tree down with error #310 the moment the prop flips.
  const pageAllowsEditing = useCanEdit();
  const mayEdit = canEdit && pageAllowsEditing;
  const setAddOpen = (v: boolean) => {
    if (!mayEdit && v !== false) return;
    setAddOpenState(v);
  };
  const setConfirmRemove = (v: Collaborator | null) => {
    if (!mayEdit && v !== null) return;
    setConfirmRemoveState(v);
  };
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /*
   * THE FIX. This posted `{ usertag }`, typed by hand into a bare text box.
   * The endpoint reads `req.body?.userId` and answers `400 userId is required`
   * when it is absent, so adding a co-seller from admin has never once worked
   * — the operator got "userId is required" and no way to act on it.
   *
   * The doc comment at the top of this file documented that wrong contract,
   * which is plainly how it came to be written, and the suite covered GET and
   * DELETE but never this body.
   *
   * Thrown, not swallowed: the picker keeps the pick and shows the message.
   */
  async function addCoSeller(recipients: Recipient[]) {
    /* Single-pick, and keyed by user id: a co-seller row is written against
       an account, which is why this picker is mounted without `emails` and
       nobody here can arrive as a bare address. */
    const [userId] = userIdsOf(recipients);
    if (!userId) throw new Error("Choose a person first.");
    const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/collaborators`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ userId }),
    });
    if (res.ok) return;
    const body = await res.json().catch(() => null);
    if (res.status === 409) throw new Error("They're already a co-seller on this product.");
    if (res.status === 403) throw new Error("You don't have permission to manage co-sellers here.");
    throw new Error(body?.error || `Could not add that member (${res.status})`);
  }

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/collaborators`, { headers: authHeaders() });
      setRows(res.ok ? await res.json() : []);
    } catch {
      setRows([]);
    }
  }, [apiBaseUrl, authHeaders, product.id]);

  React.useEffect(() => { load(); }, [load]);

  async function remove(c: Collaborator) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/collaborators/${c.userId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (res.ok) {
        await load();
        await onUpdate();
        showToast("Co-seller removed");
        setConfirmRemove(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Could not remove that co-seller");
      }
    } catch { setError("Could not remove that co-seller"); }
    setBusy(false);
  }

  const ownerId = product?.ownerId ?? product?.owner?.id;
  const isUserOwned = !product?.communityId;

  return (
    <section>
      {/* Header — title + subtitle left, actions right. Mirrors HostsView. */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-zinc-900">Co-sellers</h2>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            People who can manage this product. Payouts still go to the owner.
            {isUserOwned && " The owner is immutable."}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => setAddOpen(true)}
              className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Add member
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
        {rows === null ? (
          <p className="px-6 py-12 text-center text-[12px] text-zinc-400">Loading co-sellers…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            title="No co-sellers yet"
            body="Search for a member to add. They appear on the listing beside you."
          />
       
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.map((c) => (
              <li key={c.id}>
                <CollaboratorRow
                  collaborator={c}
                  isImmutableOwner={c.userId === ownerId || c.role === "OWNER"}
                  canManage={canEdit}
                  UserAvatar={UserAvatar}
                  onRequestRemove={() => setConfirmRemove(c)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

      {addOpen && (
        <PersonPickerModal
          open
          onClose={() => setAddOpen(false)}
          apiBaseUrl={apiBaseUrl}
          authHeaders={authHeaders}
          communityTag={communityTag ?? null}
          /*
           * Everyone already on the bench, the owner included. The member
           * search excludes them server-side; global search excludes them
           * here. Either way they cannot be picked, which is what turns the
           * old 409-after-the-fact into a person who simply is not offered.
           */
          excludeUserIds={(rows ?? []).map((c) => c.userId)}
          currentUserId={currentUserId ?? null}
          UserAvatar={UserAvatar}
          /* Single-pick: a co-seller is one person at a time, so the list
             behaves as radios and the footer shows no count. */
          copy={{
            title: "Add a co-seller",
            searchSubtitle: communityTag
              ? "Search members of this community. Guests and non-members are filtered out."
              : "Search people on Cobuntu by name or @usertag.",
            pickedSubtitle: "They'll appear on the listing beside you and can manage this product.",
            searchPlaceholder: "Search by name or @usertag",
            emptyHint: communityTag
              ? "No members to show."
              : "Type at least two characters to search.",
            searching: "Searching…",
            noMatches: "No matches.",
            unknown: "Unknown",
            consequencesTitle: "What happens next",
            stepOne: "Choose a person",
            stepTwo: "Review",
            back: "Back",
            cancel: "Cancel",
            confirm: "Add co-seller",
            confirming: "Adding…",
            membersLabel: "Members",
            showingLabel: "Showing",
            allMembersLabel: "All members",
            selectedLabel: (n: number) => `${n} selected`,
            /* Single-pick, so the staged strip never renders. The words are
               still required, so a surface that later allows several cannot
               forget to translate them. */
            selectedTitle: "Selected",
            clearAll: "Clear",
            remove: (name: string) => `Remove ${name}`,
          }}
          stepTwo={{
            kind: "consequences",
            items: [
              "They can manage this product and appear on the listing beside you.",
              "Payouts still go to the owner. No money changes hands.",
            ],
          }}
          onConfirm={addCoSeller}
          onAdded={async () => {
            setAddOpen(false);
            await load();
            await onUpdate();
            showToast("Co-seller added");
          }}
        />
      )}

      {confirmRemove && (
        <ConfirmRemoveCoSellerModal
          collaborator={confirmRemove}
          isSelf={!!currentUserId && confirmRemove.userId === currentUserId}
          submitting={busy}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => remove(confirmRemove)}
        />
      )}
    </section>
  );
}

type AvatarComponent = React.ComponentType<{
  user: { name?: string | null; profileImage?: string | null; usertag?: string | null; imageUrl?: string | null; id?: string | null };
  className?: string;
}>;

/**
 * One row: avatar, name, one always-visible inline action.
 *
 * No kebab menu — the wrong affordance for a row with exactly one action,
 * which is the conclusion the events side reached in its own redesign.
 *
 * The OWNER row is locked. product_collaborators carries a row for the owner
 * too — that is how canManageProduct answers for them — and deleting it would
 * strip the owner of their own product. Mirrors the event creator's locked
 * chip: the API would likely allow it, the UI does not offer it.
 */
function CollaboratorRow({
  collaborator,
  isImmutableOwner,
  canManage,
  UserAvatar,
  onRequestRemove,
}: {
  collaborator: Collaborator;
  isImmutableOwner: boolean;
  canManage: boolean;
  UserAvatar: AvatarComponent;
  onRequestRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-3.5 hover:bg-zinc-50/60 transition-colors">
      <UserAvatar
        user={{
          name: collaborator.user?.name,
          profileImage: collaborator.user?.profileImage,
          usertag: collaborator.user?.usertag,
          id: collaborator.user?.id,
        }}
        className="w-10 h-10 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800 truncate">{collaborator.user?.name || "Unknown"}</p>
        {collaborator.user?.usertag && (
          <p className="text-[11px] text-zinc-400 truncate">@{collaborator.user.usertag}</p>
        )}
      </div>

      {isImmutableOwner ? (
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
          title="Receives payments from this product"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Owner
        </span>
      ) : canManage ? (
        <button
          onClick={onRequestRemove}
          className="text-[12px] font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors shrink-0"
        >
          {collaborator.hasPurchased ? "Demote to buyer" : "Remove"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Confirm removal, with copy that changes to match what will actually happen.
 *
 * The old row deleted on click — no confirmation, no explanation. The thing it
 * never said is the thing that matters: removing someone who BOUGHT this
 * product does not take their purchase away (the backend records
 * DEMOTED_TO_BUYER). An operator who does not know that hesitates over a
 * harmless action, or avoids it.
 */
function ConfirmRemoveCoSellerModal({
  collaborator,
  isSelf,
  submitting,
  onCancel,
  onConfirm,
}: {
  collaborator: Collaborator;
  isSelf: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = collaborator.user?.name || collaborator.user?.usertag || "This member";
  const subject = isSelf ? "You" : name;
  const verb = isSelf ? "lose" : "loses";
  const bought = !!collaborator.hasPurchased;

  return (
    <ModalShell onClose={onCancel}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">
        {bought ? `Demote ${isSelf ? "yourself" : name} to buyer?` : `Remove ${isSelf ? "yourself" : name}?`}
      </h3>
      <p className="text-[13px] text-zinc-500 mb-2">
        {subject} {verb} the ability to manage this product and {isSelf ? "stop" : "stops"} appearing on the listing.
      </p>
      {bought && (
        <p className="text-[13px] text-zinc-500 mb-2">
          {isSelf ? "You keep" : `${name} keeps`} everything already purchased — this only ends the selling role.
        </p>
      )}
      <p className="text-[12px] text-zinc-400 mb-5">This can be undone by adding them again.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button onClick={onConfirm} disabled={submitting}
          className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 cursor-pointer">
          {submitting ? "Removing..." : bought ? "Demote" : "Remove"}
        </button>
      </div>
    </ModalShell>
  );
}
