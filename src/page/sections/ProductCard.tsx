"use client";

import { useState, useRef, useEffect } from "react";
import { PencilIcon } from "../helpers";
import { useProductManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

interface Props {
  product: any;
  communityTag: string;
  isPublished: boolean;
  listingId: string | null;
  onEditName: () => void;
  onEditPrice: () => void;
  onEditBanner: () => void;
  onEditProduct: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}

export function ProductCard({
  product, communityTag, isPublished, listingId,
  onEditName, onEditPrice, onEditBanner, onEditProduct, onPublish, onUnpublish,
}: Props) {
  // Injected by the host app; the package ships its own fallback so no host
  // is forced to supply one.
  const { UserAvatar: ConfigAvatar } = useProductManagementConfig();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;
  const [urlCopied, setUrlCopied] = useState(false);
  const [imgSize, setImgSize] = useState(280);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rightRef.current) return;
    const observer = new ResizeObserver(([entry]) => { setImgSize(entry.contentRect.height); });
    observer.observe(rightRef.current);
    return () => observer.disconnect();
  }, []);

  async function copyProductLink() {
    const url = `https://${communityTag}.cobuntu.com/marketplace/${product.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch { /* */ }
  }

  const isPaid = product?.price > 0;
  const currency = product?.currency || "EUR";

  // Get first media sorted by order
  const sortedMedia = [...(product?.media || [])].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const firstMedia = sortedMedia[0];

  // Determine product type label
  function getTypeLabel() {
    if (product?.recurringInterval === "monthly") return "Recurring (monthly)";
    if (product?.recurringInterval === "yearly") return "Recurring (yearly)";
    return "Digital Product";
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
      <div className="flex p-5 gap-5">

        {/* Left: Product Image -- 1:1 square, sized to right column height */}
        <div className="shrink-0 overflow-hidden rounded-xl relative group" style={{ width: imgSize, height: imgSize }}>
          <button onClick={onEditBanner} className="absolute inset-0 w-full h-full z-10 cursor-pointer" style={{ bottom: "40px" }} />
          {firstMedia?.url ? (
            <img src={firstMedia.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-100 flex items-center justify-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
          )}
          <div onClick={onEditBanner}
            className="absolute top-3 right-3 h-8 w-8 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center cursor-pointer hover:bg-black/80 transition-all z-20 opacity-0 group-hover:opacity-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </div>
          <button onClick={copyProductLink}
            className={`absolute bottom-0 left-0 right-0 backdrop-blur-md px-4 py-2.5 flex items-center gap-3 cursor-pointer rounded-b-xl border-t border-white/10 transition-all z-20 ${
              urlCopied ? "bg-emerald-600/90" : "bg-black/70 hover:bg-black/80"
            }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${urlCopied ? "bg-white/20" : "bg-white/10"}`}>
              {urlCopied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="opacity-80"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </div>
            <span className="text-sm font-medium text-white/90">{urlCopied ? "Link copied!" : "Copy product link"}</span>
          </button>
        </div>

        {/* Right: Info Rows */}
        <div ref={rightRef} className="flex-1 flex flex-col justify-between min-h-0">
          <div className="flex flex-col gap-1 flex-1">
            {/* Name */}
            <InfoRow onClick={onEditName}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>}>
              <p className="text-sm font-medium text-zinc-900 truncate">{product.name || "Untitled Product"}</p>
            </InfoRow>

            {/* Price */}
            <InfoRow onClick={onEditPrice}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>}>
              <p className="text-sm font-medium text-zinc-900">
                {isPaid ? `${currency} ${(Number(product.price) / 100).toFixed(2)}` : "Free"}
              </p>
            </InfoRow>

            {/* Type */}
            <InfoRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}>
              <p className="text-sm font-medium text-zinc-900">{getTypeLabel()}</p>
            </InfoRow>

            {/* CTA Text */}
            {product.ctaText && (
              <InfoRow
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-400">CTA Text</p>
                  <p className="text-sm font-medium text-zinc-900 truncate">{product.ctaText}</p>
                </div>
              </InfoRow>
            )}

            {/* Owner */}
            {(product.owner || product.user) && (() => {
              const owner = product.owner || product.user;
              return (
                <div className="flex items-center gap-3 py-1">
                  <div className="shrink-0 w-11 h-11 rounded-lg border border-zinc-200 bg-white flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <UserAvatar user={owner} className="h-7 w-7" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{owner.name || "Unknown"}</p>
                      {owner.usertag && <p className="text-[11px] text-zinc-400">@{owner.usertag}</p>}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Publish Status */}
            <div onClick={!isPublished ? onPublish : undefined}
              className={`flex items-start gap-3 rounded-lg py-1 ${!isPublished ? "hover:bg-zinc-50 cursor-pointer" : ""}`}>
              <div className={`shrink-0 w-11 h-11 rounded-lg border flex items-center justify-center ${
                isPublished ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}>
                {isPublished ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[2.75rem]">
                {isPublished ? (
                  <p className="text-sm font-medium text-emerald-600">Product is published</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-zinc-900">Product is not published yet</p>
                    <p className="text-xs text-zinc-500">Click to publish</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 shrink-0">
            <button onClick={onEditProduct}
              className="flex-1 px-4 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">
              Edit Product
            </button>
            <button onClick={isPublished ? onUnpublish : onPublish}
              className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg cursor-pointer transition-colors bg-zinc-900 text-white hover:bg-zinc-800">
              {isPublished ? "Unpublish Product" : "Publish Product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable clickable info row
function InfoRow({ children, onClick, disabled, icon, customIcon }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  icon?: React.ReactNode; customIcon?: React.ReactNode;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-3 rounded-lg transition-all text-left group py-1 ${
        onClick ? "hover:bg-zinc-50 cursor-pointer" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      {customIcon || (
        <div className="shrink-0 w-11 h-11 rounded-lg border border-zinc-200 bg-white flex items-center justify-center relative overflow-hidden">
          <div className="group-hover:opacity-0 transition-opacity">{icon}</div>
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-100"><PencilIcon /></div>
        </div>
      )}
      {children}
    </Component>
  );
}
