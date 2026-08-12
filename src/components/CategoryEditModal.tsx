"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { Check, ChevronRight } from "lucide-react";
import type { CategoryOption } from "./CategoryPickerRow";
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
      {/*
        INLINE, NOT A SECOND MODAL.
        The picker used to be a row that opened its own dialog — so choosing a
        category from inside this modal meant opening a modal on a modal, then
        a third step for the sub-category. Three surfaces to set one field.
        The whole taxonomy fits here: every category is listed, tapping one
        reveals its sub-categories, tapping a sub-category selects it.
      */}
      <div className="mb-4 max-h-[46vh] overflow-y-auto -mx-1 px-1">
        <CategoryTree
          categories={categories}
          categoryId={draft.categoryId}
          subCategoryId={draft.subCategoryId}
          onChange={setDraft}
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
 * The community's taxonomy, expanded in place.
 *
 * A category row toggles open to show its sub-categories. Tapping a
 * sub-category selects it; tapping it again clears it, because a mis-tap has
 * to be undoable without closing and reopening the modal.
 *
 * A category with NO sub-categories is selectable on its own — a taxonomy that
 * is one level deep is a real configuration, and making those rows inert would
 * leave a community unable to file anything.
 *
 * Changing category clears the sub-category: sub-categories have exactly one
 * parent, so keeping the old one would submit a pair the backend rejects.
 */
function CategoryTree({
  categories, categoryId, subCategoryId, onChange,
}: {
  categories: CategoryOption[];
  categoryId: string | null;
  subCategoryId: string | null;
  onChange: (next: { categoryId: string | null; subCategoryId: string | null }) => void;
}) {
  // Open the branch that holds the current selection, so reopening the modal
  // shows you where you already are rather than a collapsed list.
  const [openId, setOpenId] = useState<string | null>(categoryId);

  return (
    <div className="space-y-1">
      {categories.map((c) => {
        const subs = c.subcategories ?? [];
        const isOpen = openId === c.id;
        const isPicked = categoryId === c.id;
        const leaf = subs.length === 0;

        return (
          <div key={c.id}>
            <button
              type="button"
              onClick={() => {
                if (leaf) {
                  // No children — the category IS the choice.
                  onChange(isPicked ? { categoryId: null, subCategoryId: null } : { categoryId: c.id, subCategoryId: null });
                  return;
                }
                setOpenId(isOpen ? null : c.id);
                if (!isPicked) onChange({ categoryId: c.id, subCategoryId: null });
              }}
              aria-expanded={leaf ? undefined : isOpen}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                isPicked ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
            >
              {!leaf && (
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              )}
              <span className={`flex-1 min-w-0 truncate text-[13.5px] ${isPicked ? "font-medium text-zinc-900" : "text-zinc-700"}`}>
                {c.name}
              </span>
              {!leaf && (
                <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">{subs.length}</span>
              )}
              {isPicked && leaf && <Check className="h-4 w-4 shrink-0 text-zinc-900" strokeWidth={2.5} />}
            </button>

            {isOpen && subs.length > 0 && (
              <div className="ml-6 pl-3 border-l border-zinc-100 space-y-0.5 py-1">
                {subs.map((sub) => {
                  const picked = subCategoryId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() =>
                        onChange(
                          picked
                            ? { categoryId: c.id, subCategoryId: null }
                            : { categoryId: c.id, subCategoryId: sub.id },
                        )
                      }
                      aria-pressed={picked}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        picked ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate text-[13px]">{sub.name}</span>
                      {picked && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Clearing has to be reachable, or a mis-tap is permanent. */}
      {(categoryId || subCategoryId) && (
        <button
          type="button"
          onClick={() => { onChange({ categoryId: null, subCategoryId: null }); setOpenId(null); }}
          className="mt-2 px-3 py-2 text-[12.5px] text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer bg-transparent border-0"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
