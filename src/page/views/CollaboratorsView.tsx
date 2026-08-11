"use client";

import * as React from "react";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

/**
 * Co-sellers — the product answer to the event page's Hosts tab.
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
}

export function CollaboratorsView({
  product,
  onUpdate,
  showToast,
  canEdit = true,
}: {
  product: any;
  onUpdate: () => void | Promise<void>;
  showToast: (msg: string) => void;
  /**
   * A MODERATOR reviewing someone else's listing should not be re-writing who
   * sells it. Sellers manage their own bench.
   */
  canEdit?: boolean;
}) {
  const { apiBaseUrl, authHeaders, UserAvatar: ConfigAvatar } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;

  const [rows, setRows] = React.useState<Collaborator[] | null>(null);
  const [usertag, setUsertag] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/collaborators`, { headers: authHeaders() });
      setRows(res.ok ? await res.json() : []);
    } catch {
      setRows([]);
    }
  }, [apiBaseUrl, authHeaders, product.id]);

  React.useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const tag = usertag.trim().replace(/^@/, "");
    if (!tag || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/collaborators`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ usertag: tag }),
      });
      if (res.ok) {
        setUsertag("");
        await load();
        await onUpdate();
        showToast("Co-seller added");
      } else {
        // The backend distinguishes "no such member" from "already a
        // collaborator"; surfacing its message beats a generic failure.
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Could not add that member");
      }
    } catch { showToast("Could not add that member"); }
    setBusy(false);
  }

  async function remove(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/products/${product.id}/collaborators/${userId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (res.ok) { await load(); await onUpdate(); showToast("Co-seller removed"); }
      else showToast("Could not remove that co-seller");
    } catch { showToast("Could not remove that co-seller"); }
    setBusy(false);
  }

  const ownerId = product?.ownerId ?? product?.owner?.id;

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">Co-sellers</h2>
        <p className="text-[13px] text-zinc-500 mt-0.5">
          Co-sellers appear on the listing beside you and can manage it. Payouts still go to the owner.
        </p>
      </div>

      {canEdit && (
        <form onSubmit={add} className="flex items-center gap-2 mb-5">
          <input
            value={usertag}
            onChange={(e) => setUsertag(e.target.value)}
            placeholder="@usertag"
            className="flex-1 px-3 py-2 text-[14px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
          />
          <button
            type="submit"
            disabled={busy || !usertag.trim()}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
          >
            Add
          </button>
        </form>
      )}

      <div className="border border-zinc-200 rounded-xl overflow-hidden">
        {rows === null ? (
          <div className="px-4 py-6 text-[13px] text-zinc-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-zinc-400">
            No co-sellers yet. Add one by @usertag above.
          </div>
        ) : (
          rows.map((c) => {
            const isOwner = c.userId === ownerId || c.role === "OWNER";
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 last:border-b-0">
                <UserAvatar user={{ name: c.user?.name, profileImage: c.user?.profileImage, usertag: c.user?.usertag }} className="w-8 h-8" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-zinc-900 truncate">{c.user?.name || "Unknown"}</div>
                  {c.user?.usertag && <div className="text-[12px] text-zinc-400 truncate">@{c.user.usertag}</div>}
                </div>
                {isOwner ? (
                  <span className="text-[11px] font-medium text-zinc-400 border border-zinc-200 rounded-full px-2 py-0.5">Owner</span>
                ) : canEdit ? (
                  <button
                    onClick={() => remove(c.userId)}
                    disabled={busy}
                    className="text-[13px] text-zinc-400 hover:text-red-600 disabled:opacity-40 cursor-pointer"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
