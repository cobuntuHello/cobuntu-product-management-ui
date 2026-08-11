"use client";

import * as React from "react";
import { ModalShell } from "../page/helpers";
import { SortableMediaGallery, type MediaItem } from "../ui/sortable-media-gallery";
import { useProductManagementConfig } from "../config";

/**
 * Manage a product's images in one place: reorder, add, remove.
 *
 * WHY PRODUCTS GET THIS AND EVENTS DO NOT. An event has one banner. A product
 * has a banner AND a gallery — several images at whatever aspect ratio the
 * seller shot them in — so a single "edit banner" control cannot express it.
 * The card shows the banner large with the rest as a strip; this is where all
 * of them are actually managed.
 *
 * FIRST IS THE BANNER. Order carries the meaning: position one is what the
 * card and the storefront lead with, which is why the gallery is drag-ordered
 * rather than having a separate "make this the banner" action. One concept,
 * one gesture.
 *
 * Saves through the SAME multipart contract the edit drawer uses
 * (`mediaReordered`, `mediaToDelete`, `media` files) because that is what the
 * backend implements; sending only the media fields leaves every other field
 * untouched, since the update only writes what it receives.
 */
export function ProductMediaModal({
  product,
  onClose,
  onSaved,
  showToast,
}: {
  product: any;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();

  const initial = React.useMemo<MediaItem[]>(
    () =>
      [...(product?.media || [])]
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .map((m: any) => ({
          id: m.id,
          preview: m.url,
          url: m.url,
          type: (m.type === "video" ? "video" : "image") as "image" | "video",
          isExisting: true,
        })),
    [product?.media],
  );

  const [items, setItems] = React.useState<MediaItem[]>(initial);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const formData = new FormData();

      const keptIds = items.filter((m) => m.isExisting).map((m) => m.id);
      const originalIds = (product?.media || []).map((m: any) => m.id);
      const toDelete = originalIds.filter((id: string) => !keptIds.includes(id));

      if (toDelete.length > 0) formData.append("mediaToDelete", JSON.stringify(toDelete));
      formData.append("mediaReordered", JSON.stringify(keptIds));
      for (const item of items) {
        if (item.file && !item.isExisting) formData.append("media", item.file);
      }

      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${product.id}/comprehensive`, {
        method: "PUT",
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save images");
      }

      /*
       * The comprehensive update is a JOB, not a synchronous write — uploads
       * go to storage before the rows move. Poll until it reports done, or the
       * modal closes on a product that has not changed yet and the card
       * re-renders with the old images, which reads as the save having failed.
       */
      const { jobId } = await res.json();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const statusRes = await fetch(`${apiBaseUrl}/api/users/me/products/update/status/${jobId}`, {
          headers: authHeaders(),
        });
        if (!statusRes.ok) continue;
        const status = await statusRes.json();
        if (status.status === "completed") {
          showToast("Images updated");
          onSaved();
          return;
        }
        if (status.status === "failed") throw new Error(status.error || "Failed to save images");
      }
      throw new Error("Saving images timed out");
    } catch (e: any) {
      showToast(e?.message || "Failed to save images");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[640px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Images</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        Drag to reorder. The first image is the one shown on cards and at the top of the product page.
      </p>

      <div className="mb-4 max-h-[55vh] overflow-y-auto">
        <SortableMediaGallery items={items} onChange={setItems} />
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
