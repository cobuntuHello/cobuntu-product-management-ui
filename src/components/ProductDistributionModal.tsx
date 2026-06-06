"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useProductManagementConfig, useJsonHeaders } from "../config";

export interface ProductDistributionModalProps {
  product: any;
  communityTag: string;
  productId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
  /**
   * Optional override for persisting `externalDetailUrl`. When provided,
   * the modal hands the (normalized, https-validated) value back to the
   * parent instead of issuing its own product PATCH — for consumers that
   * route product writes through their own update path. `null` means
   * "standard cobuntu page" (clear the override).
   */
  onSave?: (externalDetailUrl: string | null) => Promise<void>;
}

type DetailSource = "NATIVE" | "EXTERNAL";

/**
 * The distribution-relevant slice of a marketplace product. The package
 * otherwise threads products as `any` (see EditProductDrawer / GeneralTab),
 * so this is a documentation-grade shape the Distribution modal reads its
 * initial state from — not an enforced contract over the whole product.
 *
 *   - `externalDetailUrl`: https URL the detail page 302-redirects to, or
 *     null/absent for the standard cobuntu page.
 *   - `listings[]`: per-community listing rows carrying the `featured`
 *     flag. A product can be listed in several communities, each with its
 *     own featured pin — keyed by `communityTag` (or `communityId`).
 */
export interface ProductDistributionFields {
  externalDetailUrl?: string | null;
  listings?: Array<{
    communityId?: string;
    communityTag?: string;
    featured?: boolean;
  }>;
}

/**
 * Product Distribution — mirrors event-management-ui's DistributionEditModal.
 *
 * Two independent controls:
 *
 *   1. Featured — pins one product per community to the hero slot on the
 *      community's marketplace listing. Persisted via the per-listing
 *      featured endpoint, scoped to `communityTag` (a product can be
 *      listed in several communities, each with its own featured flag).
 *      Auto-unfeature is enforced server-side in the same transaction, so
 *      no client-side juggling is needed.
 *
 *   2. Detail page source — whether cobuntu hosts the product detail page
 *      (NATIVE, default) or 302-redirects to a customer-controlled https
 *      URL (EXTERNAL, e.g. a custom landing). Persisted on the product as
 *      `externalDetailUrl` (null = native). By default the modal PATCHes
 *      the product directly; pass `onSave` to route it through the parent.
 *
 * The two writes are issued independently so a failure in one doesn't roll
 * back the other — each surfaces its own toast.
 */
export function ProductDistributionModal({
  product,
  communityTag,
  productId,
  onClose,
  onSaved,
  showToast,
  onSave,
}: ProductDistributionModalProps) {
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();

  // Initial featured state = this product's listing in `communityTag`.
  // listings[] carry per-listing `featured`; match by communityTag (or
  // communityId fallback if the API keys listings that way).
  const initialFeatured = (() => {
    const listings: any[] = product.listings || [];
    const entry = listings.find(
      (l) => l?.communityTag === communityTag || l?.communityId === communityTag,
    );
    return !!entry?.featured;
  })();

  const [detailSource, setDetailSource] = useState<DetailSource>(
    product.externalDetailUrl ? "EXTERNAL" : "NATIVE",
  );
  const [externalDetailUrl, setExternalDetailUrl] = useState<string>(product.externalDetailUrl || "");
  const [featured, setFeatured] = useState<boolean>(initialFeatured);
  const [saving, setSaving] = useState(false);

  const urlValid = detailSource === "NATIVE" || /^https:\/\/[^\s]+$/.test(externalDetailUrl);

  async function save() {
    if (!urlValid) {
      showToast("Custom landing URL must be a valid https:// URL");
      return;
    }
    setSaving(true);
    try {
      const nextUrl = detailSource === "EXTERNAL" ? externalDetailUrl.trim() : null;

      // 1. Featured flag — only write when it actually changed, so we
      //    don't needlessly churn the previously-featured product.
      let ok = true;
      if (featured !== initialFeatured) {
        const res = await fetch(
          `${apiBaseUrl}/api/listings/communities/${communityTag}/products/${productId}/featured`,
          {
            method: "PUT",
            headers: jsonHeaders(),
            body: JSON.stringify({ featured }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || "Failed to update featured status");
          ok = false;
        }
      }

      // 2. Detail-page source — persist externalDetailUrl on the product.
      if (ok && nextUrl !== (product.externalDetailUrl || null)) {
        if (onSave) {
          await onSave(nextUrl);
        } else {
          const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
            method: "PATCH",
            headers: jsonHeaders(),
            body: JSON.stringify({ externalDetailUrl: nextUrl }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || "Failed to update detail page");
            ok = false;
          }
        }
      }

      if (ok) {
        showToast("Distribution updated");
        onSaved();
      }
    } catch {
      showToast("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Distribution</h3>
      <p className="text-[12px] text-zinc-400 mb-4">
        Where members land when they click this product, and whether it&apos;s the featured &ldquo;big frame&rdquo; slot in your marketplace.
      </p>

      {/* ─── Featured ───────────────────────────────────────── */}
      <div className="flex items-start gap-3 py-3 border-y border-zinc-100">
        <input
          id="featured"
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
          className="mt-0.5 w-4 h-4 cursor-pointer accent-zinc-900"
        />
        <label htmlFor="featured" className="flex-1 cursor-pointer">
          <div className="text-[13px] font-medium text-zinc-900">Featured product</div>
          <div className="text-[12px] text-zinc-500 mt-0.5">
            Pin this product to the hero slot on your community&apos;s marketplace. Only one product per community can be featured at a time — selecting this will auto-unfeature whichever product was previously featured.
          </div>
        </label>
      </div>

      {/* ─── Detail source ──────────────────────────────────── */}
      <div className="py-3 border-b border-zinc-100">
        <div className="text-[13px] font-medium text-zinc-900 mb-2">Product detail page</div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="detailSource"
              checked={detailSource === "NATIVE"}
              onChange={() => setDetailSource("NATIVE")}
              className="mt-0.5 w-4 h-4 cursor-pointer accent-zinc-900"
            />
            <div className="flex-1">
              <div className="text-[13px] text-zinc-900">Use cobuntu&apos;s standard product page</div>
              <div className="text-[12px] text-zinc-500 mt-0.5">The default — cobuntu renders the detail page with your title, media, description, and the Buy flow.</div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="detailSource"
              checked={detailSource === "EXTERNAL"}
              onChange={() => setDetailSource("EXTERNAL")}
              className="mt-0.5 w-4 h-4 cursor-pointer accent-zinc-900"
            />
            <div className="flex-1">
              <div className="text-[13px] text-zinc-900">Use a custom landing page</div>
              <div className="text-[12px] text-zinc-500 mt-0.5">cobuntu&apos;s /marketplace/{productId} URL 302-redirects to your URL. Payments still flow through cobuntu via the public API.</div>
            </div>
          </label>
        </div>

        {detailSource === "EXTERNAL" && (
          <div className="mt-3">
            <label className="block text-[12px] font-medium text-zinc-700 mb-1.5">Custom landing URL</label>
            <input
              type="url"
              value={externalDetailUrl}
              onChange={(e) => setExternalDetailUrl(e.target.value)}
              placeholder="https://your-site.com/produtos/lisboa"
              className={`w-full px-3 py-2 text-[13px] font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400 ${
                externalDetailUrl && !urlValid ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"
              }`}
            />
            {externalDetailUrl && !urlValid && (
              <p className="text-[11px] text-red-600 mt-1">Must be a valid https:// URL.</p>
            )}
            <p className="text-[11px] text-zinc-400 mt-1.5">
              Your custom page should call cobuntu&apos;s public API for live prices and the Buy button. See Integrations → Documentation.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !urlValid}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
