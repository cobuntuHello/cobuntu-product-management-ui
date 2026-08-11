"use client";

import * as React from "react";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { ModalShell } from "../helpers";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

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
 *   POST   /products/:id/collaborators        { usertag }
 *   DELETE /products/:id/collaborators/:userId
 *
 * and canManageProduct has always admitted collaborators. Nothing surfaced it,
 * so the only way to add a co-seller was through the API. The product detail
 * page already STACKS them as co-sellers; this is where they come from.
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
}) {
  const { apiBaseUrl, authHeaders, UserAvatar: ConfigAvatar } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;

  const [rows, setRows] = React.useState<Collaborator[] | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState<Collaborator | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
          <div className="px-6 py-12 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3" aria-hidden>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-sm text-zinc-500">No co-sellers yet</p>
            <p className="text-xs text-zinc-400 mt-1">Add one by @usertag. They appear on the listing beside you.</p>
          </div>
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
        <AddCoSellerModal
          apiBaseUrl={apiBaseUrl}
          productId={product.id}
          jsonHeaders={jsonHeaders}
          onClose={() => setAddOpen(false)}
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

/** Add by @usertag. The backend distinguishes "no such member" from "already a
 *  collaborator", so its message is surfaced rather than a generic failure. */
function AddCoSellerModal({
  apiBaseUrl,
  productId,
  jsonHeaders,
  onClose,
  onAdded,
}: {
  apiBaseUrl: string;
  productId: string;
  jsonHeaders: () => Record<string, string>;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const [usertag, setUsertag] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tag = usertag.trim().replace(/^@/, "");
    if (!tag || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${productId}/collaborators`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ usertag: tag }),
      });
      if (res.ok) { await onAdded(); return; }
      const e2 = await res.json().catch(() => ({}));
      setErr(e2.error || "Could not add that member");
    } catch { setErr("Could not add that member"); }
    setSaving(false);
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Add a co-seller</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        They can manage this product and appear on the listing beside you. Payouts still go to the owner.
      </p>
      <form onSubmit={submit}>
        <input
          value={usertag}
          onChange={(e) => setUsertag(e.target.value)}
          placeholder="@usertag"
          autoFocus
          className="w-full px-3 py-2 text-[14px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 mb-3"
        />
        {err && <p className="text-[12px] text-red-600 mb-3">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
          <button type="submit" disabled={saving || !usertag.trim()}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      </form>
    </ModalShell>
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
