"use client";

import * as React from "react";
import { ProductCard } from "../sections/ProductCard";
import { OverviewActionCards } from "../sections/OverviewActionCards";
import { AfterCheckoutCard } from "../sections/AfterCheckoutCard";
import { ModalShell, API } from "../helpers";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { PriceEditModal } from "../../components/PriceEditModal";
import { NameEditModal } from "../../components/NameEditModal";
import { ShareModal } from "../../components/ShareModal";
import { DeleteModal } from "../../components/DeleteModal";
import { EditProductDrawer } from "../../components/EditProductDrawer";
import { ProductDistributionModal } from "../../components/ProductDistributionModal";
import { ProductSettingsDrawer } from "../ProductSettingsDrawer";

/**
 * The Overview tab: quick actions, the product card with its edit rows, and
 * every modal those rows open.
 *
 * This was `GeneralTab` in BOTH apps — two copies, edited independently. The
 * modal wiring is the part that rotted fastest: a modal added on one side and
 * not the other is invisible until someone clicks the row that no longer
 * opens anything.
 *
 * WHAT STAYS OUT, on purpose. The admin app also renders a donations summary
 * and a sales section; both come from packages this one does not depend on
 * (@cobuntu/sales-ui, the app's own donations components) and neither belongs
 * to a member managing their own product. They come in through `extras`
 * rather than being imported here — a slot, not a fork.
 */

export type ProductModal = "name" | "price" | "share" | "distribution" | "delete" | "unpublish" | null;

export interface OverviewViewProps {
  product: any;
  communityTag: string;
  productId: string;
  isPublished: boolean;
  listingId: string | null;

  onPublish: () => void | Promise<void>;
  onUnpublish: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  showToast: (msg: string) => void;

  /**
   * Modal state is LIFTED so the host app's page header can drive the same
   * modals as the rows here. Without this, "Edit" in the header and "Edit" in
   * the card open two different pieces of state and one of them is stale.
   * Omit both and this manages its own.
   */
  modal?: ProductModal;
  setModal?: (m: ProductModal) => void;
  showEditDrawer?: boolean;
  setShowEditDrawer?: (v: boolean) => void;

  /**
   * Member-pricing editor on each tier. Community-owned products only — a
   * member-owned product has no segments to price against, and
   * MemberPricingService rejects the write at the API anyway.
   */
  showMemberPricing?: boolean;

  /** True when the viewer owns this product, rather than moderating it. */
  isOwnerView?: boolean;

  /**
   * Whether this product can have COMMUNITY-SCOPED settings at all — who can
   * see it, who can buy it, its landing page, its post-checkout behaviour.
   *
   * False for a USER-OWNED product, where none of them mean anything: there is
   * no membership to gate against and no community storefront to redirect. The
   * backend refuses all four with a 403.
   *
   * When false the Settings quick action is NOT RENDERED — not disabled. A
   * disabled control advertises a capability this product cannot have.
   */
  canConfigureSettings?: boolean;

  /**
   * After-checkout config (membership upsell / external redirect) is a LEADER
   * capability — MARKETPLACE_CREATE — and the backend re-enforces it.
   *
   * Gating this on ownership instead, as an earlier pass did, is wrong in both
   * directions: it offers the card to a member selling their own product (who
   * gets a 403 on save) and hides it from the leader who is supposed to
   * configure it. The host app resolves the permission and answers here.
   */
  canConfigureAfterCheckout?: boolean;

  /**
   * Approval + escrow on this product's purchases.
   *
   * USER-OWNED products can be approval-gated too — this is not a
   * community-owned-only setting. Omit `onSaveApproval` to hide the card
   * entirely on a surface where the viewer may not change it.
   */
  requiresApproval?: boolean;
  onSaveApproval?: (next: boolean) => void | Promise<void>;
  approvalCopy?: { title: string; body: string };

  /** App-specific cards (sales, donations) rendered under the product card. */
  extras?: React.ReactNode;
}

export function OverviewView({
  product,
  communityTag,
  productId,
  isPublished,
  listingId,
  onPublish,
  onUnpublish,
  onUpdate,
  onDelete,
  showToast,
  modal: modalProp,
  setModal: setModalProp,
  showEditDrawer: drawerProp,
  setShowEditDrawer: setDrawerProp,
  showMemberPricing,
  isOwnerView,
  canConfigureSettings = true,
  canConfigureAfterCheckout,
  requiresApproval,
  onSaveApproval,
  approvalCopy,
  extras,
}: OverviewViewProps) {
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();

  // Controlled when the host app passes state, uncontrolled otherwise. Both
  // apps pass it today; the fallback keeps this mountable in isolation (and
  // in a test) without a wrapper.
  const [ownModal, setOwnModal] = React.useState<ProductModal>(null);
  const [ownDrawer, setOwnDrawer] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const modal = modalProp !== undefined ? modalProp : ownModal;
  const setModal = setModalProp ?? setOwnModal;
  const showEditDrawer = drawerProp !== undefined ? drawerProp : ownDrawer;
  const setShowEditDrawer = setDrawerProp ?? setOwnDrawer;

  /*
   * Optimistic, and it REVERTS on failure. A toggle that stays flipped after a
   * failed save is worse than one that never moved: the seller believes
   * purchases are gated when they are not, which is a money question, not a
   * cosmetic one.
   */
  const [approvalOn, setApprovalOn] = React.useState(!!requiresApproval);
  const [savingApproval, setSavingApproval] = React.useState(false);
  React.useEffect(() => { setApprovalOn(!!requiresApproval); }, [requiresApproval]);

  async function toggleApproval(next: boolean) {
    if (savingApproval || !onSaveApproval) return;
    const prev = approvalOn;
    setApprovalOn(next);
    setSavingApproval(true);
    try {
      await onSaveApproval(next);
    } catch {
      setApprovalOn(prev);
    } finally {
      setSavingApproval(false);
    }
  }

  /**
   * The one-field saves (rename) go through the PERSONAL products route, not
   * the community one: a member editing their own product is not editing a
   * community resource, and the community route gates on a leader permission
   * they do not hold.
   */
  async function quickUpdate(body: Record<string, any>) {
    const res = await fetch(`${apiBaseUrl || API}/api/users/me/products/${productId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update");
    await onUpdate();
  }

  return (
    <div className="space-y-6">
      <OverviewActionCards
        isPublished={isPublished}
        onShare={() => setModal("share")}
        onEdit={() => setShowEditDrawer(true)}
        onSettings={() => setSettingsOpen(true)}
        canConfigureSettings={canConfigureSettings}
        onPublish={() => void onPublish()}
        onUnpublish={() => setModal("unpublish")}
        onDelete={() => setModal("delete")}
      />

      <ProductCard
        product={product}
        communityTag={communityTag}
        isPublished={isPublished}
        listingId={listingId}
        onEditName={() => setModal("name")}
        onEditPrice={() => setModal("price")}
        onEditBanner={() => setShowEditDrawer(true)}
        onEditCta={() => setShowEditDrawer(true)}
        onPublish={() => void onPublish()}
        onUnpublish={() => setModal("unpublish")}
      />

      {onSaveApproval && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-lg border border-zinc-200 bg-white flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">
                  {approvalCopy?.title ?? "Require approval"}
                </p>
                <p className="text-[13px] text-zinc-500 leading-snug mt-0.5">
                  {approvalCopy?.body ?? "Hold each purchase until you approve it. The buyer is charged up front and refunded in full if you decline."}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={approvalOn}
              aria-label={approvalCopy?.title ?? "Require approval"}
              disabled={savingApproval}
              onClick={() => void toggleApproval(!approvalOn)}
              className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50 ${
                approvalOn ? "bg-zinc-900 border-zinc-900" : "bg-zinc-200 border-zinc-300"
              }`}
            >
              <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${approvalOn ? "left-[22px]" : "left-[3px]"}`} />
            </button>
          </div>
        </div>
      )}


      {extras}

      {modal === "name" && (
        <NameEditModal
          currentName={product.name}
          onSave={(name: string) => quickUpdate({ name })}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "price" && (
        <PriceEditModal
          product={product}
          communityTag={communityTag}
          productId={productId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void onUpdate(); }}
          showToast={showToast}
          showMemberPricing={showMemberPricing}
        />
      )}

      {modal === "share" && (
        <ShareModal
          productId={productId}
          communityTag={communityTag}
          productName={product.name}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "distribution" && (
        <ProductDistributionModal
          product={product}
          communityTag={communityTag}
          productId={productId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void onUpdate(); }}
          showToast={showToast}
        />
      )}

      {modal === "delete" && (
        <DeleteModal
          productName={product.name}
          onDelete={async () => { await onDelete(); }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "unpublish" && (
        <ModalShell onClose={() => setModal(null)}>
          <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Unpublish product?</h3>
          <p className="text-[13px] text-zinc-500 mb-5">
            &ldquo;{product.name}&rdquo; will be hidden from the community marketplace. You can republish it anytime.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={async () => { await onUnpublish(); setModal(null); }}
              className="px-4 py-2 text-[13px] font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 cursor-pointer"
            >
              Unpublish
            </button>
          </div>
        </ModalShell>
      )}

      {/*
        The settings drawer renders only when the product can have these
        settings. `canConfigureSettings` also removes the action that opens it,
        so this is belt and braces against a stale open state.
      */}
      {canConfigureSettings && (
        <ProductSettingsDrawer
          product={product}
          communityTag={communityTag}
          productId={productId}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => void onUpdate()}
          showToast={showToast}
          hideAfterCheckout={!canConfigureAfterCheckout}
        />
      )}

      <EditProductDrawer
        product={product}
        communityTag={communityTag}
        isOpen={showEditDrawer}
        onClose={() => setShowEditDrawer(false)}
        onSaved={() => { setShowEditDrawer(false); void onUpdate(); }}
      />
    </div>
  );
}
