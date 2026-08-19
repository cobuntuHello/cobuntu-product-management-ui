"use client";

import * as React from "react";
import { ProductSectionsNav, type ProductViewKey } from "./ProductSectionsNav";
import { DetailsView, type ProductModal } from "./views/DetailsView";
import { CollaboratorsView } from "./views/CollaboratorsView";
import { ListingsSection } from "./sections/ListingsSection";
import { ListingDetailDrawer } from "./sections/ListingDetailDrawer";
import { ProductActivityTab } from "../components/activity/ProductActivityTab";
import { getProductManagementConfig } from "../config";
import { ProductManageHeader, type ProductManageHeaderProps } from "./ProductManageHeader";
import { ManageAccessProvider } from "../lib/manageAccess";

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
  /**
   * Whether the host is passing a Ledger panel.
   *
   * The tab is offered only when there is something behind it. A host on an
   * older pin should show one tab fewer, not a tab that opens onto nothing --
   * and this is a parameter rather than a read of the slot because this
   * function is exported and tested on its own, away from any rendered tree.
   */
  hasLedger?: boolean;
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

  /*
   * "details" MUST be here, not only in the nav's SECTIONS list.
   *
   * SectionsNav renders the intersection of SECTIONS and this list, so adding a
   * tab in one place and not the other silently drops it -- which is exactly
   * what shipped: Overview became the dashboard, the edit stack moved to
   * Details, and Details was filtered out. Editing a product became unreachable
   * in production. A moderator does not get it, because they cannot edit.
   */
  return isModerator
    /*
     * A moderator gets the READ-ONLY surfaces, and the Ledger is one.
     *
     * The reduced set exists because a moderator cannot EDIT -- not because
     * they may not look. A community leader reviewing a member's product is a
     * moderator by this definition, and they are also the party the ledger's
     * community column is FOR: it is what makes a commission disagreement
     * answerable without leaving the page.
     *
     * The server decides who may actually read it (LedgerService reuses the
     * Overview's gate); this only decides whether to offer the tab.
     */
    ? ["overview", ...(opts.hasLedger ? (["ledger"] as ProductViewKey[]) : []), "activity"]
    /*
     * "listings" is deliberately absent: Overview carries the listings now,
     * with more per listing than that tab showed. The KEY still resolves, so an
     * existing ?view=listings link keeps working rather than 404-ing into the
     * default.
     */
    : [
        "overview", "details",
        ...(opts.hasLedger ? (["ledger"] as ProductViewKey[]) : []),
        "collaborators", "activity",
      ];
}

export interface ProductManagePageProps {
  /**
   * May this viewer CHANGE the product, as opposed to merely open this page?
   *
   * Send the backend's `viewerCanEdit`. It is resolved there by the same
   * predicate the write endpoints enforce, so the controls this page offers
   * and the writes the server accepts cannot disagree.
   *
   * False renders read-only: every editing surface stops opening and a notice
   * explains where to go instead. Used for a leader of a community that
   * CARRIES someone else's product. DEFAULTS TRUE.
   */
  canEdit?: boolean;
  /** The community's product taxonomy, loaded by the host app. */
  categories?: import("../components/CategoryPickerRow").CategoryOption[];
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

  /**
   * Whether this product can have community-scoped settings at all. False for
   * a user-owned product; the Settings action then does not render.
   * Defaults to "community-owned?" derived from the product itself.
   */
  canConfigureSettings?: boolean;

  /** Leader capability (MARKETPLACE_CREATE), resolved by the host app. */
  canConfigureAfterCheckout?: boolean;

  /** Approval + escrow. Omit onSaveApproval to hide the card. */
  requiresApproval?: boolean;
  onSaveApproval?: (next: boolean) => void | Promise<void>;
  approvalCopy?: { title: string; body: string };

  /** App-specific cards under the product card on Overview. */
  overviewExtras?: React.ReactNode;
  /**
   * What the Overview tab renders: the host app's `<ManageOverview>`.
   *
   * A slot rather than something this package builds, so the dashboard can use
   * the current shared package while this one keeps its own pin. Omitted, the
   * tab renders nothing, which is what an un-updated host should get rather
   * than a crash.
   */
  overviewSlot?: React.ReactNode;
  /**
   * The Ledger tab: every money movement for this item.
   *
   * A SLOT, like the Overview and for the same reason -- the host fetches it,
   * so the package's pin stays independent of the dashboard's. Absent means the
   * tab does not appear at all rather than rendering an empty panel: a host on
   * an older pin should show one tab fewer, not a blank one.
   */
  ledgerSlot?: React.ReactNode;
}

export function ProductManagePage({
  categories,
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
  canConfigureSettings,
  canConfigureAfterCheckout,
  requiresApproval,
  onSaveApproval,
  approvalCopy,
  overviewExtras,
  overviewSlot,
  ledgerSlot,
  // Defaults true: every consumer that has not been taught about this renders
  // exactly as before, and read-only is opt-in by the page that knows it is
  // showing someone else's product.
  canEdit = true,
}: ProductManagePageProps) {
  // Touch the config early so a host app that forgot the provider fails here,
  // loudly, rather than three views deep on a fetch.
  getProductManagementConfig();

  const allowed = React.useMemo(
    () => visibleProductViews({ product, viewerUserId, forceModerator, hasLedger: !!ledgerSlot }),
    [product, viewerUserId, forceModerator, ledgerSlot],
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
          currentUserId={viewerUserId}
        />
      );
      break;
    case "listings":
      content = (
        <ListingsSection
          productId={product?.id ?? productId}
          communityTag={communityTag}
          /*
            INLINE. Mounted as a drawer, this slid its content over the page
            and left the tab panel empty — the tab looked broken because the
            content was somewhere else entirely.
          */
          inline
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
    /*
     * DETAILS keeps every prop the old Overview had -- it is the same view,
     * renamed and moved second. Overview is the dashboard now.
     */
    case "details":
      content = (
        <DetailsView
          categories={categories}
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
          /*
           * Derived from the product when the host app says nothing, so an app
           * that forgets the prop still gets the right answer rather than
           * offering settings the backend will 403. Community-owned is the
           * whole condition — `communityId` is exactly what the server checks.
           */
          /*
           * Default to ON. This used to fall back to `!!product?.communityId`,
           * which hid the whole button on a user-owned product — and with it
           * Approval, which is the SELLER's own setting and which the backend
           * allows there. The drawer scopes its own rows now.
           */
          canConfigureSettings={canConfigureSettings ?? true}
          canConfigureAfterCheckout={canConfigureAfterCheckout}
          requiresApproval={requiresApproval}
          onSaveApproval={onSaveApproval}
          approvalCopy={approvalCopy}
          extras={overviewExtras}
        />
      );
      break;

    case "ledger":
      /* A slot, like the Overview -- the host fetches it. */
      content = ledgerSlot ?? null;
      break;

    /*
     * OVERVIEW is now the landing: how this product is doing, and whether it
     * can be sold at all. Default too, so an unknown view key lands on the
     * dashboard rather than on a form.
     */
    case "overview":
    default:
      /*
       * A SLOT, not a component this package owns.
       *
       * The dashboard is `ManageOverview` in @cobuntu/management-ui-shared, and
       * the host fetches it and passes it down. That keeps this package's pin
       * independent of the dashboard's release cadence, and it is the same
       * reason the community app keeps its own copy of the tab strip.
       *
       * AN EARLIER VERSION OF THIS COMMENT WAS WRONG and is worth correcting
       * rather than deleting: it claimed the shared bump broke fifteen tests
       * across ProductForm, EditProductDrawer and PriceEditModal. It does not.
       * Those fifteen fail at the old pin too -- they are this package's
       * baseline. The bump was measured against a stale symlinked node_modules,
       * which reported an old version while the locked tree held another, and
       * the reading stuck for several releases. Diff the failing test NAMES
       * either side of a bump, with the timings stripped, before believing a
       * dependency caused anything.
       */
      content = overviewSlot ?? null;
  }

  return (
    /*
     * The nav sits outside the read-only effect on purpose: moving between
     * tabs is reading, and a read-only viewer is here precisely to look.
     */
    <ManageAccessProvider canEdit={canEdit}>
    <div>
      {header ?? (headerProps ? <ProductManageHeader {...headerProps} /> : null)}
      {!canEdit && <ReadOnlyNotice product={product} />}
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
    </ManageAccessProvider>
  );
}

/**
 * Says WHOSE product this is and where changes actually happen.
 *
 * A page that simply refuses to save reads as broken. Naming the seller and
 * pointing at the listing conversation makes it a relationship instead: the
 * community decides whether it carries this and on what terms, and the seller
 * decides what it is.
 */
function ReadOnlyNotice({ product }: { product: any }) {
  const sellerName = product?.owner?.name || product?.creator?.name || null;

  return (
    <div
      role="note"
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <p className="font-medium">
        {sellerName ? `${sellerName} sells this.` : "This product belongs to its seller."}
      </p>
      <p className="mt-1 opacity-90">
        Your community carries it, so you manage the listing — the terms, the commission,
        and whether it stays on your shelf. Ask the seller through the listing conversation
        to change the product itself.
      </p>
    </div>
  );
}
