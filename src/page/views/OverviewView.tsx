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
  extras,
}: OverviewViewProps) {
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();

  // Controlled when the host app passes state, uncontrolled otherwise. Both
  // apps pass it today; the fallback keeps this mountable in isolation (and
  // in a test) without a wrapper.
  const [ownModal, setOwnModal] = React.useState<ProductModal>(null);
  const [ownDrawer, setOwnDrawer] = React.useState(false);
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
        onDistribution={() => setModal("distribution")}
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
        onEditProduct={() => setShowEditDrawer(true)}
        onPublish={() => void onPublish()}
        onUnpublish={() => setModal("unpublish")}
      />

      {/* Upsell config is the seller's own funnel, so it shows for an owner.
          A moderator reviewing someone else's listing has no business
          rewriting what the buyer sees after paying them. */}
      {isOwnerView !== false && (
        <AfterCheckoutCard
          communityTag={communityTag}
          productId={productId}
          initial={{
            afterCheckoutMode: product?.afterCheckoutMode ?? null,
            upsellSegmentId: product?.upsellSegmentId ?? null,
            upsellHeadline: product?.upsellHeadline ?? null,
            upsellCtaLabel: product?.upsellCtaLabel ?? null,
            postCheckoutUrl: product?.postCheckoutUrl ?? null,
          }}
          showToast={showToast}
        />
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
