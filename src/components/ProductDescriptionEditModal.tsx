"use client";

import * as React from "react";
import { ModalShell } from "../page/helpers";
import { DescriptionDialog } from "@cobuntu/management-ui-shared";
import { useProductManagementConfig, useJsonHeaders } from "../config";

import { useProductT } from "../i18n/productCopy";
/**
 * Edit a product's description — the counterpart of the event page's
 * DescriptionEditModal, and the same editor.
 *
 * THE PRODUCT MANAGE PAGE HAD NO WAY TO EDIT A DESCRIPTION AT ALL. The only
 * route was the full edit drawer, which reopens the whole create form for one
 * paragraph. Events have had a one-field modal since the quick-edit set
 * shipped; this is the missing half.
 *
 * Saves through the PERSONAL products route, like the other single-field
 * edits: a member editing their own product is not editing a community
 * resource, and the community route gates on a leader permission they do not
 * hold.
 */
export function ProductDescriptionEditModal({
  product,
  productId,
  onClose,
  onSaved,
  showToast,
}: {
  product: any;
  productId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const tp = useProductT("marketplaceUi.productUi");
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [saving, setSaving] = React.useState(false);

  async function save(content: string) {
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ description: content.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update description");
      }
      showToast(tp("productDescriptionEditModal.descriptionUpdated"));
      onSaved();
    } catch (e: any) {
      showToast(e?.message || tp("productDescriptionEditModal.failedToUpdateDescription"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DescriptionDialog
      open
      title={tp("productDescriptionEditModal.editDescription")}
      value={product?.description || ""}
      placeholder={tp("productDescriptionEditModal.describeYourProduct")}
      cancelLabel={tp("common.cancel")}
      doneLabel="Save"
      busy={saving}
      busyLabel="Saving..."
      onCancel={onClose}
      onDone={(next) => void save(next)}
    />
  );
}

/**
 * Edit the checkout button's label.
 *
 * It was a read-only line on the card that only appeared once the field had a
 * value — so there was no way to SET it from here: the row you would click did
 * not exist until you had used another surface to fill it in.
 */
export function ProductCtaEditModal({
  product,
  productId,
  onClose,
  onSaved,
  showToast,
}: {
  product: any;
  productId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const tp = useProductT("marketplaceUi.productUi");
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [value, setValue] = React.useState<string>(product?.ctaText || "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        // Empty clears it, which restores the default label rather than
        // printing an empty button.
        body: JSON.stringify({ ctaText: value.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update button text");
      }
      showToast(tp("productDescriptionEditModal.buttonTextUpdated"));
      onSaved();
    } catch (e: any) {
      showToast(e?.message || tp("productDescriptionEditModal.failedToUpdateButtonText"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">{tp("productDescriptionEditModal.buttonText")}</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        {tp("productDescriptionEditModal.whatTheCheckoutButtonSays")}
      </p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={tp("productDescriptionEditModal.buyNow")}
        maxLength={40}
        className="w-full px-3 py-2 text-[14px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 mb-4"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
          {tp("common.cancel")}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? tp("common.saving") : tp("common.save")}
        </button>
      </div>
    </ModalShell>
  );
}
