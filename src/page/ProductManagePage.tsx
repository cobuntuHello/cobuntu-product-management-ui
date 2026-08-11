"use client";

import * as React from "react";
import { ProductSectionsNav, type ProductViewKey } from "./ProductSectionsNav";
import { OverviewView, type ProductModal } from "./views/OverviewView";
import { CollaboratorsView } from "./views/CollaboratorsView";
import { ListingsSection } from "./sections/ListingsSection";
import { ListingDetailDrawer } from "./sections/ListingDetailDrawer";
import { ProductActivityTab } from "../components/activity/ProductActivityTab";
import { getProductManagementConfig } from "../config";
import { ProductManageHeader, type ProductManageHeaderProps } from "./ProductManageHeader";

/**
 * THE product manage page. One implementation, both apps.
 *
 * The package used to export a KIT — forms, modals, drawers — and never the
 * PAGE, so each app composed its own from the same parts and nothing forced
 * the two to converge. The admin app's got months of refinement; the
 * community app's did not. This is the event page's answer applied to
 * products.
 *
 * WHAT THE HOST APP STILL OWNS, deliberately:
 *
 *   the URL     `view` / `onViewChange`. The admin app routes tabs on a query
 *               param; the community app may want a path segment. Owning the
 *               router here would force one on both.
 *   the fetch   the host app loads the product so it can gate the route
 *               before anything renders.
 *   the extras  sales and donations cards come from packages this one does
 *               not depend on, and belong to a moderation surface rather than
 *               to a member managing their own product.
 *
 * Everything else — tabs, views, edit rows, modals — lives here, so a change
 * lands in both apps or in neither.
 */

export type { ProductViewKey, ProductModal };

/**
 * Which tabs this viewer gets.
 *
 * OWNER vs MODERATOR is the whole distinction, and it is NOT "is this an
 * admin app". A leader reviewing a member's submission is a moderator even in
 * the community app; a leader managing the community's own product is its
 * owner even in the admin app.
 *
 *   Collaborators — the seller's own bench. A moderator has no business
 *                   rewriting who sells someone else's product.
 *   Listings      — where the product is offered. Owner-facing: it is the
 *                   seller who asks a community to carry it.
 *   Activity      — available to both. It is the answer to "who changed
 *                   this", which is the question a moderator asks most.
 */
export function visibleProductViews(opts: {
  product: any;
  viewerUserId?: string | null;
  /** Host app override for a surface that is moderation by definition. */
  forceModerator?: boolean;
}): ProductViewKey[] {
  const ownerId = opts.product?.ownerId ?? opts.product?.owner?.id ?? null;
  const collaborators: any[] = opts.product?.collaborators ?? [];

  /*
   * UNKNOWN VIEWER GETS THE FULL SET, and this is the important line.
   *
   * "Not identified as the seller" is not the same as "is a moderator", and
   * conflating them means a host app that simply forgot to pass viewerUserId
   * silently loses Listings and Collaborators for the actual owner — a page
   * that quietly drops features for the person it belongs to, which is the
   * same failure as the manage route 404ing on people who could manage.
   *
   * Reaching this page at all already required canManageProduct, so the
   * permissive answer is never a leak. An app that wants the moderator set
   * must say so with forceModerator; it cannot happen by omission.
   */
  const knowsViewer = !!opts.viewerUserId;
  const isSeller =
    !knowsViewer ||
    ownerId === opts.viewerUserId ||
    collaborators.some((c) => c?.userId === opts.viewerUserId);

  // forceModerator is the app ASSERTING this is a review surface, so it wins
  // outright — it is the one case where the reduced set is a deliberate
  // statement rather than a gap in what we know. Otherwise a seller who is
  // also a leader keeps the seller set: the more permissive answer is the
  // true one, and they are still that product's seller.
  const isModerator = opts.forceModerator === true || !isSeller;

  return isModerator
    ? ["overview", "activity"]
    : ["overview", "collaborators", "listings", "activity"];
}

export interface ProductManagePageProps {
  communityTag: string;
  /** Id or sku, whichever the host app routes on. */
  productId: string;
  /** The loaded product. The host app owns the fetch so it can gate the route. */
  product: any;

  onUpdate: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onPublish: () => void | Promise<void>;
  onUnpublish: () => void | Promise<void>;
  showToast: (msg: string) => void;

  view: ProductViewKey;
  onViewChange: (v: ProductViewKey) => void;

  isPublished: boolean;
  listingId: string | null;

  /**
   * The shared header's inputs. Preferred over `header` — passing these gets
   * both apps the same breadcrumbs, icons and buttons, which is the point. A
   * slot per app is how the two headers diverged in the first place.
   */
  headerProps?: ProductManageHeaderProps;
  /** Escape hatch for a genuinely app-specific header. Wins over headerProps. */
  header?: React.ReactNode;

  /** Lifted so the host app's page header can drive the same modals. */
  modal?: ProductModal;
  setModal?: (m: ProductModal) => void;
  showEditDrawer?: boolean;
  setShowEditDrawer?: (v: boolean) => void;

  /** Communities the viewer belongs to, for the Listings tab. */
  hubs?: React.ComponentProps<typeof ListingsSection>["hubs"];

  viewerUserId?: string | null;
  forceModerator?: boolean;
  showMemberPricing?: boolean;

  /** App-specific cards under the product card on Overview. */
  overviewExtras?: React.ReactNode;
}

export function ProductManagePage({
  communityTag,
  productId,
  product,
  onUpdate,
  onDelete,
  onPublish,
  onUnpublish,
  showToast,
  view,
  onViewChange,
  isPublished,
  listingId,
  headerProps,
  header,
  modal,
  setModal,
  showEditDrawer,
  setShowEditDrawer,
  hubs,
  viewerUserId,
  forceModerator,
  showMemberPricing,
  overviewExtras,
}: ProductManagePageProps) {
  // Touch the config early so a host app that forgot the provider fails here,
  // loudly, rather than three views deep on a fetch.
  getProductManagementConfig();

  const allowed = React.useMemo(
    () => visibleProductViews({ product, viewerUserId, forceModerator }),
    [product, viewerUserId, forceModerator],
  );

  // A `view` this viewer may not use falls back rather than rendering an
  // empty frame — these URLs get shared between people with different roles.
  const active: ProductViewKey = allowed.includes(view) ? view : "overview";
  const isSeller = allowed.includes("collaborators");

  // The Listings tab opens a drawer for one listing. Kept at page level
  // because the drawer overlays the whole page, not the tab panel.
  const [detailListing, setDetailListing] = React.useState<any | null>(null);

  let content: React.ReactNode;
  switch (active) {
    case "collaborators":
      content = (
        <CollaboratorsView
          product={product}
          onUpdate={onUpdate}
          showToast={showToast}
          canEdit={isSeller}
        />
      );
      break;
    case "listings":
      content = (
        <ListingsSection
          productId={product?.id ?? productId}
          communityTag={communityTag}
          isOpen
          onClose={() => onViewChange("overview")}
          onShowDetail={setDetailListing}
          onListingsChange={() => void onUpdate()}
          showToast={showToast}
          hubs={hubs}
        />
      );
      break;
    case "activity":
      content = <ProductActivityTab product={product ?? { id: productId }} communityTag={communityTag} />;
      break;
    case "overview":
    default:
      content = (
        <OverviewView
          product={product}
          communityTag={communityTag}
          productId={productId}
          isPublished={isPublished}
          listingId={listingId}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onUpdate={onUpdate}
          onDelete={onDelete}
          showToast={showToast}
          modal={modal}
          setModal={setModal}
          showEditDrawer={showEditDrawer}
          setShowEditDrawer={setShowEditDrawer}
          showMemberPricing={showMemberPricing}
          isOwnerView={isSeller}
          extras={overviewExtras}
        />
      );
  }

  return (
    <div>
      {header ?? (headerProps ? <ProductManageHeader {...headerProps} /> : null)}
      <ProductSectionsNav activeView={active} onViewChange={onViewChange} visibleViews={allowed} />
      {content}

      {detailListing && (
        <ListingDetailDrawer
          listing={detailListing}
          communityTag={communityTag}
          onClose={() => setDetailListing(null)}
          onRefresh={() => { setDetailListing(null); void onUpdate(); }}
        />
      )}
    </div>
  );
}
