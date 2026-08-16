"use client";

import React, { createContext, useContext } from "react";

/**
 * May the viewer CHANGE this product, or only look at it?
 *
 * ── Why the manage page needed a second answer ──────────────────────────────
 *
 * Opening the manage page and editing what is on it are different permissions.
 * `canManage` on the product detail has always meant EDIT: owner, collaborator,
 * or a leader of the community that OWNS it. The page read that one flag and
 * showed "forbidden" when it was false — so a leader of a community that
 * CARRIES a member's product could not see it at all, even though the product
 * sits on their storefront under terms they agreed to.
 *
 * The backend now sends both answers, under the same names the event side uses:
 *
 *   viewerCanManage   may OPEN the manage page
 *   viewerCanEdit     may CHANGE what is on it
 *
 * ── Why a context and not a prop ────────────────────────────────────────────
 *
 * The affordances that write are spread across views, modals and drawers that
 * are several levels apart. Threading a boolean through all of them is how one
 * ends up missing it — and a missed one is not cosmetic, it is a control that
 * looks live and is not. That already happened once on the event side, where
 * two views were overlooked because they opened their editors directly rather
 * than through the shared modal state.
 *
 * DEFAULT TRUE, so every existing consumer renders exactly as before and
 * read-only is opt-in by the page that knows it is showing someone else's
 * product.
 */
const ManageAccessContext = createContext<{ canEdit: boolean }>({ canEdit: true });

export function ManageAccessProvider({
  canEdit,
  children,
}: {
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <ManageAccessContext.Provider value={{ canEdit }}>{children}</ManageAccessContext.Provider>
  );
}

/** True when the viewer may change this product. */
export function useCanEdit(): boolean {
  return useContext(ManageAccessContext).canEdit;
}
