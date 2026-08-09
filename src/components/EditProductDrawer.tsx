"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useProductManagementConfig } from "../config";
import { type CategoryOption } from "./CategoryPickerRow";
import { ProductForm, type ProductFormData } from "./ProductForm";
import type { MediaItem } from "../ui/sortable-media-gallery";
import type { UploadedFile } from "../ui/file-upload-zone";

interface Props {
  /**
   * The community's product categories, loaded by the consumer — same contract
   * as ProductForm, which this drawer renders. Passed straight through so the
   * create and edit surfaces cannot disagree about the list.
   */
  categories?: CategoryOption[];
  product: any;
  communityTag: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditProductDrawer({ product, communityTag, isOpen, onClose, onSaved, categories }: Props) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();
  const formDataRef = useRef<ProductFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleClose() { setAnimating(false); setTimeout(onClose, 300); }

  const initialFormData = useMemo<Partial<ProductFormData>>(() => {
    const mediaItems: MediaItem[] = (product.media || [])
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((m: any) => ({
        id: m.id,
        preview: m.url,
        url: m.url,
        type: m.mimeType?.startsWith("video/") ? "video" as const : "image" as const,
        isExisting: true,
      }));

    const productFiles: UploadedFile[] = (product.attachments || []).map((a: any) => ({
      id: a.id,
      name: a.originalName || a.fileName || "file",
      size: a.fileSize || 0,
      type: a.mimeType || "application/octet-stream",
      url: a.url,
      isExisting: true,
    }));

    const priceInDollars = product.price ? (product.price / 100) : 0;

    return {
      name: product.name || "",
      description: product.description || "",
      tags: product.tags?.map((t: any) => ({ id: t.id || t.tagId, name: t.name || t.tag?.name })).filter((t: any) => t.id && t.name) || [],
      categoryId: (product as any).categoryId ?? null,
      subCategoryId: (product as any).subCategoryId ?? null,
      mediaItems,
      productFiles,
      isPaid: !!product.price && product.price > 0,
      price: priceInDollars > 0 ? String(priceInDollars) : "",
      currency: product.currency || "USD",
      isRecurring: product.isRecurring || false,
      recurringInterval: product.recurringInterval || "monthly",
      ctaText: product.ctaText || "",
      viewability: product.viewability || "PUBLIC",
      accessibility: product.accessibility || "PUBLIC",
      requiresApproval: product.requiresApproval || false,
    };
  }, [product]);

  async function handleSave() {
    const data = formDataRef.current;
    if (!data) return;
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("name", data.name.trim());
      formData.append("description", data.description.trim() || "");

      /*
       * Only send a price when this form actually produced one.
       *
       * This used to fall through to `price: "0"` whenever `data.price` was
       * empty — and since ProductForm stopped owning single-price entry it
       * ALWAYS emits `price: ""`. So opening this drawer on a priced product
       * and saving anything (a typo in the title) silently zeroed its price.
       * The backend only writes price when the field is present
       * (`if (updates.price !== undefined)`), so omitting it leaves the
       * product's real price alone.
       */
      if (data.isPaid && data.price) {
        formData.append("price", String(parseFloat(data.price)));
        formData.append("currency", data.currency);
        formData.append("isRecurring", String(data.isRecurring));
        if (data.isRecurring) formData.append("recurringInterval", data.recurringInterval);
      } else {
        formData.append("isRecurring", "false");
      }

      if (data.ctaText.trim()) formData.append("ctaText", data.ctaText.trim());

      // 2-axis visibility — backend processUpdateJob forwards both to
      // updateProduct (PR feat/update-path-product-visibility 2026-05-20).
      formData.append("viewability", data.viewability);
      formData.append("accessibility", data.accessibility);
      // Buyer-approval gate — comprehensive update coerces the "true"/"false"
      // string; propagated to tier sub-products backend-side.
      formData.append("requiresApproval", String(!!data.requiresApproval));

      formData.append("tags", JSON.stringify(data.tags.map(t => t.id)));
      // Always sent, unlike create: on an EDIT an absent field means "leave
      // as is", so clearing a category would be impossible if we only sent it
      // when set. "" is what the backend normalises to null.
      formData.append("categoryId", data.categoryId ?? "");
      formData.append("subCategoryId", data.subCategoryId ?? "");

      const existingMediaIds = data.mediaItems.filter(m => m.isExisting).map(m => m.id);
      const originalMediaIds = (product.media || []).map((m: any) => m.id);
      const mediaToDelete = originalMediaIds.filter((id: string) => !existingMediaIds.includes(id));
      if (mediaToDelete.length > 0) formData.append("mediaToDelete", JSON.stringify(mediaToDelete));
      formData.append("mediaReordered", JSON.stringify(existingMediaIds));

      for (const item of data.mediaItems) {
        if (item.file && !item.isExisting) formData.append("media", item.file);
      }

      const existingAttachmentIds = data.productFiles.filter(f => f.isExisting).map(f => f.id);
      const originalAttachmentIds = (product.attachments || []).map((a: any) => a.id);
      const attachmentsToDelete = originalAttachmentIds.filter((id: string) => !existingAttachmentIds.includes(id));
      if (attachmentsToDelete.length > 0) formData.append("attachmentsToDelete", JSON.stringify(attachmentsToDelete));

      for (const file of data.productFiles) {
        if (file.file && !file.isExisting) formData.append("attachments", file.file);
      }

      // FormData: auth header only (no Content-Type — browser sets the multipart boundary)
      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${product.id}/comprehensive`, {
        method: "PUT",
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }

      const { jobId } = await res.json();

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`${apiBaseUrl}/api/users/me/products/update/status/${jobId}`, {
          headers: authHeaders(),
        });
        if (statusRes.ok) {
          const status = await statusRes.json();
          if (status.status === "completed") { onSaved(); return; }
          if (status.status === "failed") throw new Error(status.error || "Update failed");
        }
      }
    } catch (err: any) {
      console.error("Save failed:", err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${animating ? "opacity-100" : "opacity-0"}`} onClick={handleClose} />
      <div className={`absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl rounded-l-2xl flex flex-col transition-transform duration-300 ease-out ${animating ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100">
          <button onClick={handleClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
              <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
            </svg>
          </button>
          <h2 className="text-[15px] font-semibold text-zinc-900">Edit Product</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ProductForm
            communityTag={communityTag}
            initialData={initialFormData}
            categories={categories}
            onChange={data => { formDataRef.current = data; }}
          />
        </div>

        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-2">
          <button onClick={handleClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-w-[100px] px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
