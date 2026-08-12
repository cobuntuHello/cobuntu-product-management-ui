"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { CategoryPickerRow, type CategoryOption } from "./CategoryPickerRow";
import { useProductManagementConfig, useJsonHeaders } from "../config";

/**
 * Edit a product's category from its own row.
 *
 * Reuses CategoryPickerRow — the same control the create form uses — so the
 * two-level category/sub-category choice behaves identically wherever it is
 * made, rather than being reimplemented here and drifting.
 *
 * The taxonomy is a PROP, not a fetch. These packages make no API calls of
 * their own so they can be embedded without provider wiring; the host app
 * loads the categories and passes them down. That is also why the row is
 * hidden when a host has not supplied them: better absent than dead.
 */
export function CategoryEditModal({
  productId, categories, categoryId, subCategoryId, onClose, onSaved, showToast,
}: {
  productId: string;
  categories: CategoryOption[];
  categoryId: string | null;
  subCategoryId: string | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [draft, setDraft] = useState<{ categoryId: string | null; subCategoryId: string | null }>({
    categoryId: categoryId ?? null,
    subCategoryId: subCategoryId ?? null,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        // Null clears it — "Uncategorised" has to be reachable, or a mistaken
        // pick would be permanent.
        body: JSON.stringify({
          categoryId: draft.categoryId,
          subCategoryId: draft.subCategoryId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update category");
      }
      showToast("Category updated");
      onSaved();
    } catch (e: any) {
      showToast(e?.message || "Failed to update category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[520px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Category</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        Where this sits when someone browses the marketplace rather than searching it.
      </p>
      <div className="mb-4">
        <CategoryPickerRow
          categories={categories}
          categoryId={draft.categoryId}
          subCategoryId={draft.subCategoryId}
          onChange={setDraft}
          noun="product"
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
