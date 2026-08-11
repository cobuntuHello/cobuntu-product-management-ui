"use client";

import * as React from "react";
import { ModalShell } from "../page/helpers";
import { RichTextEditor } from "../ui/rich-text-editor";
import { useProductManagementConfig, useJsonHeaders } from "../config";

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
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [content, setContent] = React.useState<string>(product?.description || "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
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
      showToast("Description updated");
      onSaved();
    } catch (e: any) {
      showToast(e?.message || "Failed to update description");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[640px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Edit description</h3>
      <div className="mb-4 max-h-[60vh] overflow-y-auto">
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Describe your product..."
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
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
      showToast("Button text updated");
      onSaved();
    } catch (e: any) {
      showToast(e?.message || "Failed to update button text");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Button text</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        What the checkout button says. Leave it empty to use the default.
      </p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buy now"
        maxLength={40}
        className="w-full px-3 py-2 text-[14px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 mb-4"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
