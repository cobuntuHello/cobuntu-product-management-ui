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
import { ProductDescriptionEditModal, ProductCtaEditModal } from "../../components/ProductDescriptionEditModal";
import { ProductMediaModal } from "../../components/ProductMediaModal";

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

export type ProductModal = "name" | "price" | "share" | "distribution" | "delete" | "unpublish" | "description" | "cta" | "media" | null;

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
        onEditMedia={() => setModal("media")}
        onEditCta={() => setModal("cta")}
        onEditDescription={() => setModal("description")}
        onPublish={() => void onPublish()}
        onUnpublish={() => setModal("unpublish")}
      />

      {/*
        REQUIRE APPROVAL MOVED INTO THE SETTINGS DRAWER.

        It was a full-width card sitting under the product card, which put a
        configuration switch in the middle of the page's content. It is a
        setting, and every other setting lives behind the Settings action —
        which is exactly how the event page is arranged. Same rule, same place.
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
          requiresApproval={requiresApproval}
          onSaveApproval={onSaveApproval}
          approvalCopy={approvalCopy}
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
