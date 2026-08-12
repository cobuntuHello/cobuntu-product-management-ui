"use client";

import * as React from "react";
import { useState } from "react";
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
  /** Opens the media manager — banner and gallery are one surface. */
  onEditMedia: () => void;
  /** Opens the CTA-text editor. Omit to hide the row. */
  onEditCta?: () => void;
  /** Opens the description editor. Omit to hide the row. */
  onEditDescription?: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}

export function ProductCard({
  product, communityTag, isPublished, listingId,
  onEditName, onEditPrice, onEditMedia, onEditCta, onEditDescription, onPublish, onUnpublish,
}: Props) {
  // Injected by the host app; the package ships its own fallback so no host
  // is forced to supply one.
  const { UserAvatar: ConfigAvatar } = useProductManagementConfig();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;
  const [urlCopied, setUrlCopied] = useState(false);
  /*
   * NO MEASUREMENT. The media column used to size itself from the RIGHT
   * column's measured height, so a square image matched the rows beside it.
   *
   * That had a fixed point only while the left column was exactly one square.
   * Adding the thumbnail strip broke it into a runaway: left = image + strip,
   * so left > right; the row takes the taller side; the right column stretches
   * to the row; the observer reads the taller right column and grows the image
   * again. The card inflated until it filled the viewport.
   *
   * A fixed column width has no such loop, and "as tall as the rows happen to
   * be" was never a real design requirement — it was a way to avoid choosing
   * a size.
   */

  async function copyProductLink() {
    const url = `https://${communityTag}.cobuntu.com/marketplace/${product.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch { /* */ }
  }

  /*
   * The row shows a one-line preview, so the markup has to come off first —
   * a raw "<p>Two days…" in a card row is a bug the reader can see.
   */
  const plainDescription = React.useMemo(() => {
    const raw: string = product?.description || "";
    return raw.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }, [product?.description]);

  const isPaid = product?.price > 0;
  const currency = product?.currency || "EUR";

  const sortedMedia = [...(product?.media || [])].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

  /*
   * WHICH IMAGE IS THE BANNER — all four sources, in the storefront's order.
   *
   * This read `media[0]` and nothing else, so a product whose banner lives on
   * `bannerImageUrl` with no media rows rendered "Add your first image" while
   * the storefront cheerfully displayed that banner. The card was not hiding
   * the image; it never looked for it.
   *
   * `isBanner` leads because the column exists and events already honour it in
   * five places — products ignoring it is the reason "which one is the banner"
   * had two different answers depending on the entity.
   */
  const bannerMedia = sortedMedia.find((m: any) => m.isBanner) ?? sortedMedia[0];
  const legacyBanner: string | null = product?.cardImageUrl || product?.bannerImageUrl || null;
  const bannerUrl: string | null = bannerMedia?.url ?? legacyBanner;
  /* The rail carries every image that is not the banner, in order. */
  const railMedia = sortedMedia.filter((m: any) => m !== bannerMedia);

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start p-4 sm:p-5 gap-4 sm:gap-5">

        {/*
          MEDIA COLUMN — the events card's geometry, plus a gallery rail.

          A 280 square with the pencil top-right and the copy bar along the
          bottom edge, dropping to a full-width 16/9 on mobile. All of that is
          lifted from EventCard so the two manage pages stop looking like
          different products.

          THE ONE DELIBERATE DIFFERENCE: events size that square with a
          ResizeObserver reading the info column. Products cannot. The rail
          makes the left column taller than the right, the row takes the taller
          side, the right column stretches to the row, and the observer reads
          THAT and grows the image again — the card inflated until it filled
          the viewport. A fixed 280 is identical at rest with no fixed point to
          run away from.
        */}
        <div className="shrink-0 w-[280px] max-sm:w-full">
          <div className="overflow-hidden rounded-xl relative group w-[280px] h-[280px] max-sm:!w-full max-sm:!h-auto max-sm:aspect-[16/9]">
            <button
              onClick={onEditMedia}
              aria-label={bannerUrl ? "Manage images" : "Add images"}
              className="absolute inset-0 w-full h-full z-10 cursor-pointer"
              style={{ bottom: "40px" }}
            />

            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              /*
                The empty state gives a REASON, not an instruction — "Add
                images" only restates what the button already says. No rail is
                drawn here either: an add tile beside an add frame is the same
                offer made twice.
              */
              <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-center px-4 border-[1.5px] border-dashed border-zinc-300 rounded-xl">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-zinc-400">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <span className="text-[12.5px] font-semibold text-zinc-600">Add your first image</span>
                <span className="text-[11.5px] leading-snug text-zinc-400 max-w-[22ch]">
                  Listings with a photo are opened far more often.
                </span>
              </div>
            )}

            {/* How many there are. Nine and three were indistinguishable —
                the extras appeared nowhere on this card. */}
            {sortedMedia.length > 1 && (
              <span className="absolute top-3 left-3 h-8 px-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11.5px] font-semibold z-20 pointer-events-none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                {sortedMedia.length}
              </span>
            )}

            {bannerUrl && (
              <div
                onClick={onEditMedia}
                className="absolute top-3 right-3 h-8 w-8 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center cursor-pointer hover:bg-black/80 transition-all z-20 opacity-0 group-hover:opacity-100"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </div>
            )}

            {/* Copy link sits ON the image, exactly where events puts it. */}
            <button
              onClick={copyProductLink}
              className={`absolute bottom-0 left-0 right-0 backdrop-blur-md px-4 py-2.5 flex items-center gap-3 cursor-pointer rounded-b-xl border-t border-white/10 transition-all z-20 ${
                urlCopied ? "bg-emerald-600/90" : "bg-black/70 hover:bg-black/80"
              }`}
            >
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

          {/* The rail: one tile per image after the banner, then a single add
              tile. It used to be four fixed slots whose "+" only appeared at
              one image or fewer, so a three-image product showed two dead
              tiles you could not add through. */}
          {bannerUrl && (
            <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide">
              {railMedia.map((m: any) => (
                <button
                  key={m.id ?? m.url}
                  onClick={onEditMedia}
                  aria-label="Manage images"
                  className="shrink-0 w-[52px] h-[52px] rounded-lg overflow-hidden cursor-pointer"
                >
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              <button
                onClick={onEditMedia}
                aria-label="Add images"
                className="shrink-0 w-[52px] h-[52px] rounded-lg cursor-pointer grid place-items-center text-[17px] leading-none
                           text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors
                           border-[1.5px] border-dashed border-zinc-300 bg-zinc-50"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Right: Info Rows */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
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

            {/*
              Description — the product manage page had NO way to edit one.
              The only route was the full edit drawer, which reopens the entire
              create form for one paragraph. Events have had a single-field
              modal since the quick-edit set shipped.

              Rendered even when empty, for the same reason the button-text row
              is: a row that only appears once the field has a value cannot be
              the thing you use to give it one.
            */}
            {onEditDescription && (
              <InfoRow onClick={onEditDescription}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="3" y2="12"/><line x1="15" y1="18" x2="3" y2="18"/></svg>}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-400">Description</p>
                  <p className={`text-sm truncate ${plainDescription ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
                    {plainDescription || "Add a description"}
                  </p>
                </div>
              </InfoRow>
            )}

            {/*
              CTA text — always rendered, even when empty. It used to appear
              only once set, so there was no way to set it from here: the row
              you would click did not exist until after you had used another
              surface to fill it in.
            */}
            {onEditCta && (
              <InfoRow onClick={onEditCta}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-400">Button text</p>
                  <p className={`text-sm font-medium truncate ${product.ctaText ? "text-zinc-900" : "text-zinc-400"}`}>
                    {product.ctaText || "Buy now (default)"}
                  </p>
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

            {/*
              Publish status — a ROW, and the only place publishing happens.
              It used to be click-to-publish one way and a BUTTON the other,
              so unpublishing lived somewhere the publishing did not. Both
              directions are the row now: the card is a list of properties and
              publish is one of them.
            */}
            <div onClick={isPublished ? onUnpublish : onPublish}
              className="flex items-start gap-3 rounded-lg py-1 hover:bg-zinc-50 cursor-pointer">
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
                  <>
                    <p className="text-sm font-medium text-emerald-600">Product is published</p>
                    <p className="text-xs text-zinc-500">Click to unpublish</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-zinc-900">Product is not published yet</p>
                    <p className="text-xs text-zinc-500">Click to publish</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/*
            NO BUTTONS. The card is a list of the product's properties, each
            row opening the editor for that one thing — the event card's
            shape. "Edit Product" was a second, competing way to reach the same
            fields, and a button labelled with the whole noun invites a
            full-form edit where a row edit is what people actually want.
            Publishing is the row above; the drawer is a quick action.
          */}
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
