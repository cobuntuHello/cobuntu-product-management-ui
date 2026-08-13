"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ProductVisibilityEditModal, type VisibilityAxis } from "../components/ProductVisibilityEditModal";
import { ProductDistributionModal } from "../components/ProductDistributionModal";
import { AfterCheckoutCard } from "./sections/AfterCheckoutCard";
import { ModalShell } from "./helpers";
import { tierAccessSummary, toTierAccessValue } from "@cobuntu/management-ui-shared";

/**
 * Settings drawer for the product manage page — the product answer to the
 * event page's SettingsDrawer, same interaction and same chrome.
 *
 * Holds the config that is NOT core product metadata (name, price, media,
 * description). Every row here is COMMUNITY-SCOPED:
 *
 *   Who can see this   — products.viewability
 *   Who can buy this   — products.accessibility
 *   Landing page       — products.externalDetailUrl
 *   After checkout     — the post-purchase upsell / redirect
 *
 * WHY THE WHOLE DRAWER DISAPPEARS FOR A USER-OWNED PRODUCT.
 *
 * Every one of those is a statement about a COMMUNITY: who among its members
 * may see or buy this, where its storefront sends people, what it promotes
 * after a sale. A personal product has no membership to gate against and no
 * community storefront, so none of them mean anything — and the backend
 * refuses all four with a 403 (see communityScopedSettings on the server).
 *
 * Showing a disabled row would be worse than showing nothing: it advertises a
 * capability that does not exist for this product and invites the question
 * "how do I unlock it?", which has no answer. The consumer passes
 * `canConfigure: false` and the ACTION THAT OPENS THIS never renders either.
 *
 * This is the affordance. The server is the guard.
 *
 * Interaction mirrors the event drawer exactly: clicking a row slides the
 * drawer out and opens its modal; closing the modal slides the drawer back
 * with fresh state. The drawer owns no form state — each modal saves itself
 * and calls onSaved.
 */

type ModalKey = VisibilityAxis | "distribution" | "after-checkout" | null;

export interface ProductSettingsDrawerProps {
  product: any;
  communityTag: string;
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
  /**
   * Drops the "After checkout" row on its own. That config promotes a
   * community MEMBERSHIP, so the backend additionally requires
   * MARKETPLACE_CREATE — a leader. The other three rows need only that the
   * product be community-owned.
   */
  hideAfterCheckout?: boolean;

  /**
   * Approval + escrow on this product's purchases.
   *
   * It used to be a full-width card under the product card — a configuration
   * switch sitting in the middle of the page's content. It is a setting, so it
   * lives with the settings, which is how the event page is arranged.
   *
   * Unlike the four rows above it, this one is NOT community-scoped: a
   * user-owned product can be approval-gated too. It renders whenever a
   * handler is supplied.
   */
  requiresApproval?: boolean;
  /** The community's membership tiers, for the access pickers. */
  membershipTiers?: { id: string; name: string }[];
  /** Tier ids currently granted each axis. */
  viewTierIds?: string[];
  buyTierIds?: string[];
  onSaveApproval?: (next: boolean) => void | Promise<void>;
  approvalCopy?: { title: string; body: string };
}

/*
 * ROW LABELS ARE THE EVENTS ONES, VERBATIM.
 *
 * These read "Who can see this" / "Who can buy this" / "Landing page" while
 * the events drawer says Visibility / Access / Distribution — the same four
 * settings, the same drawer, different words. A leader who manages both saw
 * two products.
 *
 * The events wording wins because it is shorter and already the one written
 * into the docs. Do not "improve" one side without the other.
 */
export function ProductSettingsDrawer({
  product,
  communityTag,
  productId,
  isOpen,
  onClose,
  onSaved,
  showToast,
  hideAfterCheckout,
  requiresApproval,
  membershipTiers = [],
  viewTierIds,
  buyTierIds,
  onSaveApproval,
  approvalCopy,
}: ProductSettingsDrawerProps) {
  /*
   * Optimistic, and it REVERTS on failure. A toggle that stays flipped after a
   * failed save tells a seller their purchases are gated when the server never
   * agreed — a money question, not a cosmetic one.
   */
  /*
   * Which rows this drawer may show.
   *
   * Visibility, Access, Distribution and After checkout are statements about a
   * COMMUNITY, and the backend refuses them outright on a user-owned product
   * (COMMUNITY_SCOPED_PRODUCT_FIELDS → 403). Approval is the SELLER's own —
   * deliberately left out of that list — so it stays on both ownership kinds.
   *
   * Matches the event drawer exactly; see cobuntu-event-management-ui
   * fix/settings-always-visible for the full reasoning.
   */
  const isCommunityOwned = !!product?.communityId;
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

  const [visible, setVisible] = React.useState(false);
  const [animating, setAnimating] = React.useState(false);
  const [modal, setModal] = React.useState<ModalKey>(null);

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Re-animate when returning from a sub-modal.
  React.useEffect(() => {
    if (visible && !modal) {
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    }
  }, [visible, modal]);

  function handleClose() {
    setAnimating(false);
    setTimeout(onClose, 300);
  }

  function openModal(key: ModalKey) {
    setAnimating(false);
    setTimeout(() => {
      setVisible(false);
      setModal(key);
    }, 300);
  }

  function closeModalAndReopenDrawer() {
    setModal(null);
    setVisible(true);
  }

  function modalSaved() {
    onSaved();
    closeModalAndReopenDrawer();
  }

  // ─── Active sub-modal (mutually exclusive with the drawer) ────────
  // Gated identically to the rows that open them, so a stale `modal` can't
  // surface an editor the backend would 403.
  if ((modal === "viewability" || modal === "accessibility") && isCommunityOwned) {
    return (
      <ProductVisibilityEditModal
        product={product}
        productId={productId}
        axis={modal}
        membershipTiers={membershipTiers}
        initialTierIds={modal === "viewability" ? viewTierIds : buyTierIds}
        // Always the VIEW grants, whichever axis is open: the buy modal needs
        // its ceiling, and the view modal ignores it.
        viewTierIds={viewTierIds}
        onClose={closeModalAndReopenDrawer}
        onSaved={modalSaved}
        showToast={showToast}
      />
    );
  }
  if (modal === "distribution" && isCommunityOwned) {
    return (
      <ProductDistributionModal
        product={product}
        communityTag={communityTag}
        productId={productId}
        onClose={closeModalAndReopenDrawer}
        onSaved={modalSaved}
        showToast={showToast}
      />
    );
  }
  // Gated identically to the row that opens it, so a stale `modal` state
  // cannot surface an editor the backend would 403.
  if (modal === "after-checkout" && !hideAfterCheckout) {
    return (
      <ModalShell onClose={closeModalAndReopenDrawer} width="w-[560px]">
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
          showToast={(m: string) => { showToast(m); onSaved(); }}
        />
        <div className="flex justify-end pt-4">
          <button
            onClick={closeModalAndReopenDrawer}
            className="px-4 py-2 text-[13px] font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 cursor-pointer"
          >
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  if (!visible) return null;
  if (typeof document === "undefined") return null;

  /*
   * Tier-aware summaries. "Members only" while three of five tiers are
   * excluded describes something that is not true, so the row now says
   * Everyone / All members / the tier names.
   */
  const viewLabel = tierAccessSummary(toTierAccessValue(product?.viewability ?? "PUBLIC", viewTierIds), membershipTiers);
  const buyLabel = tierAccessSummary(toTierAccessValue(product?.accessibility ?? "PUBLIC", buyTierIds), membershipTiers);
  const landingLabel = product?.externalDetailUrl ? "Custom landing page" : "Cobuntu product page";

  return createPortal(
    <>
      {/*
        z-[120] clears the community app's chrome, which sits at z-[52]. At
        z-50 the overlay rendered UNDER the nav sidebar — the bug that made
        the ownership modal look broken.
      */}
      <div
        className={`fixed inset-0 z-[120] transition-opacity duration-300 ${animating ? "bg-black/50" : "bg-black/0"}`}
        onClick={handleClose}
      />

      <div
        className={`fixed inset-y-0 right-0 z-[120] w-full max-w-lg bg-white shadow-2xl flex flex-col rounded-l-2xl overflow-hidden transition-transform duration-300 ease-out ${
          animating ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-zinc-900">Settings</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Grouped, not just gated. These are refused on a user-owned
              product (COMMUNITY_SCOPED_PRODUCT_FIELDS, 403), and hiding them
              unlabelled read as missing features rather than one rule.
              Approval below is the SELLER's own and stays on both kinds. */}
          {isCommunityOwned && (
            <p className="px-5 pt-4 pb-1 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Community access
            </p>
          )}
          {isCommunityOwned && (
          <SettingsRow
            label="Visibility"
            summary={viewLabel}
            onClick={() => openModal("viewability")}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            }
          />
          )}
          {isCommunityOwned && (
          <SettingsRow
            label="Access"
            summary={buyLabel}
            onClick={() => openModal("accessibility")}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
          />
          )}
          {isCommunityOwned && (
          <SettingsRow
            label="Distribution"
            summary={landingLabel}
            onClick={() => openModal("distribution")}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                <path d="M4 4h16v6H4z" />
                <path d="M4 14h16v6H4z" />
                <circle cx="8" cy="7" r="1" fill="currentColor" />
                <circle cx="8" cy="17" r="1" fill="currentColor" />
              </svg>
            }
          />
          )}
          {onSaveApproval && (
            <p className="px-5 pt-4 pb-1 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Your settings
            </p>
          )}
          {onSaveApproval && (
            <div className="w-full flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
              <span className="shrink-0 w-9 h-9 rounded-lg border border-zinc-200 bg-white flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-zinc-900">
                  {approvalCopy?.title ?? "Require approval"}
                </span>
                <span className="block text-[12px] text-zinc-500 leading-snug">
                  {approvalCopy?.body ?? "Hold each purchase until you approve it."}
                </span>
              </span>
              {/* A switch, not a chevron: this row changes state in place
                  rather than opening an editor, so it must not look like the
                  rows that do. */}
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
          )}

          {!hideAfterCheckout && (
            <SettingsRow
              label="After checkout"
              summary={afterCheckoutSummary(product)}
              onClick={() => openModal("after-checkout")}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              }
            />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** One-line state, so a row says what it is set to without being opened. */
function afterCheckoutSummary(product: any): string {
  const mode = product?.afterCheckoutMode;
  if (mode === "UPSELL") return "Promotes a membership";
  if (mode === "REDIRECT") return "Redirects to a page";
  return "Cobuntu confirmation";
}

function SettingsRow({
  label,
  summary,
  onClick,
  icon,
}: {
  label: string;
  summary: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-4 border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer text-left"
    >
      <span className="shrink-0 w-9 h-9 rounded-lg border border-zinc-200 bg-white flex items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-zinc-900">{label}</span>
        <span className="block text-[12px] text-zinc-500 truncate">{summary}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 shrink-0" aria-hidden>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
