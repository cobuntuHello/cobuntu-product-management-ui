"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventTags } from "../ui/event-tags";
import { useProductManagementConfig, useJsonHeaders } from "../config";

type Tag = { id: string; name: string };

/**
 * Edit a product's tags on their own, from a row on the card.
 *
 * Tags were reachable ONLY through the Edit Product drawer — the whole create
 * form reopened to change one chip. Every other property on this card has a
 * one-field editor; tags were the exception because nobody had given them a
 * row, not because they needed the form.
 *
 * Uses the same EventTags control the form does, so search-and-create
 * behaves identically wherever you edit them.
 *
 * Saves through the PERSONAL products route, like the other single-field
 * edits: a member editing their own product is not editing a community
 * resource, and the community route gates on a leader permission they do not
 * hold.
 */
export function TagsEditModal({
  productId, currentTags, onClose, onSaved, showToast,
}: {
  productId: string;
  currentTags: Tag[];
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [tags, setTags] = useState<Tag[]>(currentTags ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        // Names, not ids — the backend resolves or creates each one, which is
        // what lets a seller invent a tag from here.
        body: JSON.stringify({ tags: tags.map((t) => t.name) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update tags");
      }
      showToast("Tags updated");
      onSaved();
    } catch (e: any) {
      showToast(e?.message || "Failed to update tags");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[520px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Tags</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        How buyers find this when they are browsing rather than searching.
      </p>
      <div className="mb-4">
        <EventTags selectedTags={tags} onTagsChange={setTags} placeholder="Search or create tags..." />
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
