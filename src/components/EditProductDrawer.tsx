"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useProductManagementConfig, useJsonHeaders } from "../config";
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

/** A LINK-kind product_attachment: an external URL revealed to buyers after
 *  purchase (feat/product-link-deliverable). The backend stores the URL in
 *  `url` and the buyer-facing label in `originalName`. */
interface LinkDeliverable {
  /** Present for a persisted link; absent for one staged this session. */
  id?: string;
  url: string;
  label: string;
}

/** Matches the backend's addProductLinkController guard (http/https only). */
const LINK_URL_RE = /^https?:\/\/\S+$/i;

export function EditProductDrawer({ product, communityTag, isOpen, onClose, onSaved, categories }: Props) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const formDataRef = useRef<ProductFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  /*
   * Link deliverables live OUTSIDE ProductFormData because ProductForm is a
   * pure controlled form with no productId, and the link endpoint
   * (POST /api/products/:productId/attachments/link) needs one — so links are
   * only editable here, on the edit path, where product.id exists.
   *
   * Existing LINK attachments, links removed this session (persisted via the
   * comprehensive PUT's attachmentsToDelete, which is GCS-safe for links), and
   * links staged for add (POSTed to the link endpoint after the PUT).
   */
  const isPhysical = product.productType === "PHYSICAL";
  const [existingLinks, setExistingLinks] = useState<LinkDeliverable[]>([]);
  const [linksToDelete, setLinksToDelete] = useState<string[]>([]);
  const [newLinks, setNewLinks] = useState<LinkDeliverable[]>([]);
  const [linkLabelDraft, setLinkLabelDraft] = useState("");
  const [linkUrlDraft, setLinkUrlDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  // Seed link state ONCE per opened product — keyed on product.id, NOT the
  // whole product object. A parent re-render that passes a fresh `product`
  // reference (same id) must not wipe the seller's staged link add/removes;
  // the main form is protected the same way (seeds once per record id).
  useEffect(() => {
    if (!isOpen) return;
    const links: LinkDeliverable[] = (product.attachments || [])
      .filter((a: any) => (a.kind ?? "FILE") === "LINK")
      .map((a: any) => ({ id: a.id, url: a.url, label: a.originalName || a.url }));
    setExistingLinks(links);
    setLinksToDelete([]);
    setNewLinks([]);
    setLinkLabelDraft("");
    setLinkUrlDraft("");
    setLinkError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id]);

  function addLinkDraft() {
    const url = linkUrlDraft.trim();
    if (!LINK_URL_RE.test(url)) {
      setLinkError("Enter a valid http(s) link.");
      return;
    }
    setNewLinks(prev => [...prev, { url, label: linkLabelDraft.trim() || url }]);
    setLinkLabelDraft("");
    setLinkUrlDraft("");
    setLinkError(null);
  }
  function removeExistingLink(id: string) {
    setExistingLinks(prev => prev.filter(l => l.id !== id));
    setLinksToDelete(prev => [...prev, id]);
  }
  function removeNewLink(idx: number) {
    setNewLinks(prev => prev.filter((_, i) => i !== idx));
  }

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

    // LINK-kind attachments are managed in the Link deliverables section, not
    // the file uploader — excluding them here keeps a link from rendering as a
    // bogus 0-byte "file" (and out of the file-delete diff in handleSave).
    const productFiles: UploadedFile[] = (product.attachments || [])
      .filter((a: any) => (a.kind ?? "FILE") !== "LINK")
      .map((a: any) => ({
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
      /*
       * Physical-only, seeded so reopening this drawer shows what the listing
       * actually says rather than an empty postage row. ProductForm nulls both
       * again if the product is not physical, so seeding them unconditionally
       * is safe.
       */
      condition: (product as any).condition ?? null,
      parcelClass: (product as any).parcelClass ?? "STANDARD",
    };
  }, [product]);

  async function handleSave() {
    const data = formDataRef.current;
    if (!data) return;
    setSaving(true);
    setSaveError(null);

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

      /*
       * DELETE ONLY WHAT THE USER ACTUALLY REMOVED.
       *
       * This used to diff `data.productFiles` against the product's existing
       * FILE attachments: anything the form no longer listed was deleted. That
       * was right while the form owned product-level files. It stopped being
       * right when deliverables moved INSIDE each variant — ProductForm now
       * emits `productFiles: []` unconditionally (see its onChange), so the
       * diff saw zero surviving files and marked EVERY existing attachment for
       * deletion on EVERY save. A seller editing a product's title would lose
       * its downloads.
       *
       * The form no longer manages product-level files, so it cannot express
       * an intent to remove one, and this path must not infer one from an
       * absence. Only links, which this drawer still owns explicitly, are
       * deleted here.
       */
      const attachmentsToDelete = [...linksToDelete];
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
          if (status.status === "completed") {
            // Staged link deliverables can't ride the multipart comprehensive
            // PUT (no productId until the product exists in create; and the
            // backend only ingests links via its dedicated endpoint), so POST
            // each once the product update has landed. Drop each from state as
            // it succeeds so a mid-loop failure + retry does NOT re-create the
            // links that already landed (the endpoint is not idempotent).
            const remaining = [...newLinks];
            while (remaining.length > 0) {
              const link = remaining[0];
              const linkRes = await fetch(`${apiBaseUrl}/api/products/${product.id}/attachments/link`, {
                method: "POST",
                headers: jsonHeaders(),
                body: JSON.stringify({ url: link.url, label: link.label }),
              });
              if (!linkRes.ok) {
                const e = await linkRes.json().catch(() => ({}));
                setNewLinks(remaining); // only the un-posted links survive for retry
                throw new Error(e.error || e.message || "Failed to add link deliverable");
              }
              remaining.shift();
            }
            setNewLinks([]);
            onSaved();
            return;
          }
          if (status.status === "failed") throw new Error(status.error || "Update failed");
        }
      }
    } catch (err: any) {
      console.error("Save failed:", err.message);
      setSaveError(err?.message || "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120]">
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
            /*
             * The product's OWN type. Without it this drawer defaults to
             * DIGITAL, so editing a physical listing would show the digital
             * form: no postage row, no stock field, and an "Add files" row
             * offering a delivery channel that listing does not use.
             */
            productType={product.productType}
            initialData={initialFormData}
            categories={categories}
            // This drawer manages link deliverables itself (below) against the
            // live product, so the form must not render a second link section.
            showLinkDeliverables={false}
            onChange={data => { formDataRef.current = data; }}
          />

          {/*
            * Link deliverables — external URLs revealed only to verified buyers
            * (feat/product-link-deliverable). Digital-delivery only, mirroring
            * the file uploader's !isPhysical gate. Edit-path only: the add
            * endpoint needs a productId, so create adds files, then edits to
            * attach links.
            */}
          {!isPhysical && (
            <div className="mt-6 pt-6 border-t border-zinc-100">
              <h3 className="text-[13px] font-semibold text-zinc-900">Link deliverables</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                External links revealed to buyers after purchase. Anyone with the link can open it, so only paying buyers ever see the URL.
              </p>

              {(existingLinks.length > 0 || newLinks.length > 0) && (
                <ul className="mt-3 space-y-1.5">
                  {existingLinks.map(link => (
                    <li key={link.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-zinc-800 truncate">{link.label}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{link.url}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => link.id && removeExistingLink(link.id)}
                        className="text-[12px] text-zinc-400 hover:text-red-500 cursor-pointer shrink-0"
                        aria-label={`Remove ${link.label}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {newLinks.map((link, idx) => (
                    <li key={`new-${idx}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-zinc-800 truncate">{link.label}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{link.url}</p>
                      </div>
                      <span className="text-[11px] text-emerald-600 shrink-0">New</span>
                      <button
                        type="button"
                        onClick={() => removeNewLink(idx)}
                        className="text-[12px] text-zinc-400 hover:text-red-500 cursor-pointer shrink-0"
                        aria-label={`Remove ${link.label}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={linkLabelDraft}
                  onChange={e => setLinkLabelDraft(e.target.value)}
                  placeholder="Label (e.g. Download page)"
                  className="w-full px-3 py-2 text-[13px] rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkUrlDraft}
                    onChange={e => { setLinkUrlDraft(e.target.value); if (linkError) setLinkError(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLinkDraft(); } }}
                    placeholder="https://…"
                    className="flex-1 min-w-0 px-3 py-2 text-[13px] rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={addLinkDraft}
                    disabled={!linkUrlDraft.trim()}
                    className="px-3 py-2 text-[13px] font-medium bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    Add link
                  </button>
                </div>
                {linkError && <p className="text-[12px] text-red-500">{linkError}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-end gap-2">
          {saveError && (
            <p className="mr-auto text-[12px] text-red-600 max-w-[60%]">{saveError}</p>
          )}
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
