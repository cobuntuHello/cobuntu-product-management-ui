"use client";

import { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { EventTags } from "../ui/event-tags";
import { RichTextEditor } from "../ui/rich-text-editor";
import { SortableMediaGallery, type MediaItem } from "../ui/sortable-media-gallery";
import { FileUploadZone, type UploadedFile } from "../ui/file-upload-zone";
import { cn } from "../ui/utils";
import {
  ProductTiersAndDonations,
  type TierDraft,
  type DonationDraft,
  blankTier,
  blankDonation,
} from "./ProductTiersAndDonations";
import {
  Pencil, FileText, Tag as TagIcon, Image as ImageIcon, Package,
  DollarSign, MousePointerClick, ChevronRight, Check, BarChart3,
  Eye, EyeOff, UserCheck, Lock,
} from "lucide-react";

// ─── Currencies ────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", symbol: "$", flag: "🇦🇺" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
];

function getCurrencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code;
}

// ─── Types ─────────────────────────────────────────────────────

interface Tag { id: string; name: string; }

export interface ProductFormData {
  name: string;
  description: string;
  tags: Tag[];
  mediaItems: MediaItem[];
  productFiles: UploadedFile[];
  isPaid: boolean;
  price: string;
  currency: string;
  isRecurring: boolean;
  recurringInterval: "monthly" | "yearly";
  ctaText: string;
  // View gate — who can see the product detail page. MEMBERS_ONLY hides
  // the product from non-members entirely (404). Backend column added
  // 2026-05-20 by feat/visibility-overrides; backend defaults to the
  // community's effective MARKETPLACE visibility when omitted on create.
  viewability: "PUBLIC" | "MEMBERS_ONLY";
  // Action gate — who can purchase. MEMBERS_ONLY blocks non-member
  // checkout (finances service rejects with 403). Same default
  // resolution as viewability.
  accessibility: "PUBLIC" | "MEMBERS_ONLY";
  /**
   * Tier list — populated only when the consumer renders this form with
   * `showTiers={true}` AND the user has flipped on multi-tier mode.
   * Single-price mode leaves this empty and uses `price` / `currency`
   * instead. The two modes are mutually exclusive; the backend rejects
   * a payload that sends both.
   */
  tiers: TierDraft[];
  /**
   * Donation sidecar. Always present but `enabled: false` by default —
   * the parent emits `donationDraftToPayload(donation)` which returns
   * `null` for disabled donations.
   */
  donation: DonationDraft;
  // (viewability + accessibility declared above — both default PUBLIC.)
}

interface ProductFormProps {
  communityTag: string;
  initialData?: Partial<ProductFormData>;
  onChange?: (data: ProductFormData) => void;
  showErrors?: boolean;
  /**
   * When true, paid products can opt into multiple price tiers + a
   * donation sidecar via an "Advanced pricing" toggle. Defaults to
   * `false` so existing callers keep the simple single-price form.
   */
  showTiers?: boolean;
}

// ─── Component ─────────────────────────────────────────────────

export function ProductForm({ communityTag, initialData, onChange, showErrors, showTiers }: ProductFormProps) {
  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [tags, setTags] = useState<Tag[]>(initialData?.tags || []);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialData?.mediaItems || []);
  const [productFiles, setProductFiles] = useState<UploadedFile[]>(initialData?.productFiles || []);
  const [isPaid, setIsPaid] = useState(initialData?.isPaid || false);
  const [price, setPrice] = useState(initialData?.price || "");
  const [currency, setCurrency] = useState(initialData?.currency || "USD");
  const [isRecurring, setIsRecurring] = useState(initialData?.isRecurring || false);
  const [recurringInterval, setRecurringInterval] = useState<"monthly" | "yearly">(initialData?.recurringInterval || "monthly");
  const [ctaText, setCtaText] = useState(initialData?.ctaText || "");
  const [viewability, setViewability] = useState<"PUBLIC" | "MEMBERS_ONLY">(initialData?.viewability || "PUBLIC");
  const [accessibility, setAccessibility] = useState<"PUBLIC" | "MEMBERS_ONLY">(initialData?.accessibility || "PUBLIC");

  // Multi-tier mode — opt-in even when `showTiers` is true. Single-price
  // stays the default so the simple "I just want one price" path doesn't
  // get blown up with tier cards.
  const [multiTier, setMultiTier] = useState(initialData?.tiers && initialData.tiers.length > 0);
  const [tiers, setTiers] = useState<TierDraft[]>(initialData?.tiers && initialData.tiers.length > 0 ? initialData.tiers : [blankTier(currency)]);
  const [donation, setDonation] = useState<DonationDraft>(initialData?.donation || blankDonation(currency));

  // UI state
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  // Notify parent
  useEffect(() => {
    // When multi-tier mode is on, the parent product carries no price of
    // its own — emit empty `price` + empty `tiers` accordingly. Backend
    // rejects a payload that sends both. Donation always flows through.
    const emittedTiers = multiTier ? tiers : [];
    const emittedPrice = multiTier ? "" : price;
    onChange?.({
      name, description, tags, mediaItems, productFiles,
      isPaid, price: emittedPrice, currency,
      isRecurring: multiTier ? false : isRecurring,
      recurringInterval, ctaText,
      viewability, accessibility,
      tiers: emittedTiers,
      donation,
    });
  }, [name, description, tags, mediaItems, productFiles, isPaid, price, currency, isRecurring, recurringInterval, ctaText, viewability, accessibility, multiTier, tiers, donation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme-aware tokens (work on dark community themes AND the light admin via
  // color-mix off the current text colour + a brand var with a zinc fallback).
  const T = {
    fill: "color-mix(in srgb, currentColor 5%, transparent)",
    line: "color-mix(in srgb, currentColor 10%, transparent)",
    line2: "color-mix(in srgb, currentColor 16%, transparent)",
    brand: "var(--brand-color, #18181b)",
    brandTint: "color-mix(in srgb, var(--brand-color, #18181b) 15%, transparent)",
    brandLine: "color-mix(in srgb, var(--brand-color, #18181b) 45%, transparent)",
  };
  const segStyle = (on: boolean): React.CSSProperties =>
    on ? { background: T.brandTint, color: T.brand, boxShadow: `inset 0 0 0 1px ${T.brandLine}` } : undefined as unknown as React.CSSProperties;

  return (
    <div className="space-y-6">
      {/* ─── Product Name ─── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <Pencil className="h-4 w-4" />
          Product Name
          <span className="text-red-500">*</span>
        </h3>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Product Name"
          error={showErrors && !name.trim() ? "Product name is required" : undefined} />
      </div>

      {/* ─── Description ─── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Description
        </h3>
        <button type="button" onClick={() => setIsDescriptionOpen(true)}
          className="w-full flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 cursor-pointer">
          <span className="text-sm text-zinc-400">{description ? "Edit description" : "Tap to edit description"}</span>
          <ChevronRight className="h-5 w-5 text-zinc-400" />
        </button>
      </div>

      {/* ─── Tags ─── */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <TagIcon className="h-4 w-4" />
          Product Tags
        </label>
        <EventTags selectedTags={tags} onTagsChange={setTags} placeholder="Add tags to categorize your product..." />
      </div>

      {/* ─── Product Gallery ─── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Product Gallery
        </h3>
        <SortableMediaGallery items={mediaItems} onChange={setMediaItems} maxItems={5} />
      </div>

      {/* ─── Product Files ─── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <Package className="h-4 w-4" />
          Product Files
        </h3>
        <FileUploadZone files={productFiles} onChange={setProductFiles} maxFiles={10} />
      </div>

      {/* ─── Pricing (redesigned 2026-07) — segmented Free/Paid, price as the
          hero when Paid, billing as a segmented control, multi-tier folded
          behind Advanced. Compact: only as tall as the current state needs. */}
      <div className="space-y-3">
        <div className="text-sm font-medium flex items-center gap-2 opacity-80">
          <DollarSign className="h-4 w-4" />
          Pricing
        </div>

        {/* Free / Paid segmented */}
        <div className="flex gap-1.5 rounded-xl border p-1" style={{ borderColor: T.line, background: T.fill }}>
          <button type="button"
            onClick={() => { setIsPaid(false); setIsRecurring(false); setPrice(""); }}
            className="flex-1 rounded-lg py-2 text-[13.5px] font-semibold transition-colors cursor-pointer"
            style={segStyle(!isPaid)}>
            Free
          </button>
          <button type="button"
            onClick={() => setIsPaid(true)}
            className="flex-1 rounded-lg py-2 text-[13.5px] font-semibold transition-colors cursor-pointer"
            style={segStyle(isPaid)}>
            Paid
          </button>
        </div>

        {!isPaid ? (
          <div className="flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] opacity-75" style={{ borderColor: T.line, background: T.fill }}>
            <Check className="h-4 w-4 shrink-0" style={{ color: T.brand }} />
            Free for everyone in the community.
          </div>
        ) : !multiTier ? (
          <div className="space-y-3.5">
            {/* Price hero — currency inline with the amount */}
            <div className="space-y-1.5">
              <Label>Price</Label>
              <div className="flex items-stretch rounded-xl border overflow-hidden" style={{ borderColor: T.line2 }}>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-auto shrink-0 gap-1 border-0 rounded-none px-3 font-semibold focus:ring-0" style={{ borderRight: `1px solid ${T.line}` }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.code} - {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <input
                  type="number" min={0} step={0.01} value={price}
                  onChange={e => setPrice(e.target.value)} placeholder="0.00"
                  aria-label={`Price in ${currency}`}
                  className="flex-1 min-w-0 bg-transparent px-4 py-3 text-lg font-bold outline-none border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:opacity-40"
                  style={{ color: "inherit" }}
                />
              </div>
              {showErrors && isPaid && (!price || parseFloat(price) <= 0) && (
                <p className="text-[12px] text-red-500">Price is required for paid products</p>
              )}
            </div>

            {/* Billing — segmented One-time / Monthly / Yearly */}
            <div className="space-y-1.5">
              <Label>Billing</Label>
              <div className="flex gap-1.5">
                {([
                  { key: "onetime", label: "One-time", on: !isRecurring },
                  { key: "monthly", label: "Monthly", on: isRecurring && recurringInterval === "monthly" },
                  { key: "yearly", label: "Yearly", on: isRecurring && recurringInterval === "yearly" },
                ] as const).map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => {
                      if (opt.key === "onetime") setIsRecurring(false);
                      else { setIsRecurring(true); setRecurringInterval(opt.key as "monthly" | "yearly"); }
                    }}
                    className="flex-1 rounded-lg border py-2.5 text-[12.5px] font-semibold transition-colors cursor-pointer"
                    style={opt.on ? segStyle(true) : { borderColor: T.line, background: T.fill }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced pricing (tiers + donations) — one expandable row */}
            {showTiers && (
              <button type="button" onClick={() => setMultiTier(true)}
                className="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-[13px] transition-colors cursor-pointer hover:opacity-90"
                style={{ borderColor: T.line, background: T.fill }}>
                <span className="flex items-center gap-2.5">
                  <BarChart3 className="h-[18px] w-[18px] opacity-60" />
                  <span><b className="font-semibold">Advanced pricing</b> <span className="opacity-60">· tiers + donations</span></span>
                </span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </button>
            )}
          </div>
        ) : (
          // Multi-tier mode
          <div className="space-y-3">
            <button type="button" onClick={() => setMultiTier(false)}
              className="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-[13px] transition-colors cursor-pointer hover:opacity-90"
              style={{ borderColor: T.brandLine, background: T.brandTint, color: T.brand }}>
              <span className="flex items-center gap-2.5">
                <BarChart3 className="h-[18px] w-[18px]" />
                <b className="font-semibold">Advanced pricing</b>
              </span>
              <span className="text-[12px] font-semibold">Back to simple</span>
            </button>
            {showTiers && (
              <ProductTiersAndDonations
                tiers={tiers}
                onTiersChange={setTiers}
                donation={donation}
                onDonationChange={setDonation}
                showErrors={showErrors}
              />
            )}
          </div>
        )}
      </div>

      {/* ─── Visibility ─── */}
      {/* 2-axis visibility (PR feat/visibility-overrides 2026-05-20):
          - viewability: who can SEE the listing
          - accessibility: who can PURCHASE
          Defaults are PUBLIC for both; backend createProduct stamps from
          the community's effective default when these fields aren't sent. */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Visibility
        </h3>
        <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
          <div
            onClick={() => setViewability(viewability === "PUBLIC" ? "MEMBERS_ONLY" : "PUBLIC")}
            className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {viewability === "PUBLIC" ? <Eye className="h-[18px] w-[18px] text-zinc-400 shrink-0" /> : <EyeOff className="h-[18px] w-[18px] text-zinc-400 shrink-0" />}
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-800">Visibility: {viewability === "PUBLIC" ? "Public" : "Members only"}</span>
                <p className="text-[11px] text-zinc-400 mt-0.5">Who can see this product listing</p>
              </div>
            </div>
            <Switch
              checked={viewability === "MEMBERS_ONLY"}
              onCheckedChange={v => setViewability(v ? "MEMBERS_ONLY" : "PUBLIC")}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div
            onClick={() => setAccessibility(accessibility === "PUBLIC" ? "MEMBERS_ONLY" : "PUBLIC")}
            className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {accessibility === "PUBLIC" ? <UserCheck className="h-[18px] w-[18px] text-zinc-400 shrink-0" /> : <Lock className="h-[18px] w-[18px] text-zinc-400 shrink-0" />}
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-800">Purchase: {accessibility === "PUBLIC" ? "Public" : "Members only"}</span>
                <p className="text-[11px] text-zinc-400 mt-0.5">Who can buy this product</p>
              </div>
            </div>
            <Switch
              checked={accessibility === "MEMBERS_ONLY"}
              onCheckedChange={v => setAccessibility(v ? "MEMBERS_ONLY" : "PUBLIC")}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      </div>

      {/* ─── CTA Text ─── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <MousePointerClick className="h-4 w-4" />
          Call-to-Action Text
        </h3>
        <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="e.g., 'Get Started', 'Buy Now', 'Learn More'" maxLength={15} />
        <p className="text-[11px] text-zinc-400">Customize the action button on your product cards. Default: &ldquo;Buy Now&rdquo;. Max 15 characters.</p>
      </div>

      {/* ─── Description Editor Dialog ─── */}
      <Dialog open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Product Description</DialogTitle>
            <DialogDescription>Describe your product. What will customers get?</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RichTextEditor content={description} onChange={setDescription} placeholder="Write your product description..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDescriptionOpen(false)}>Cancel</Button>
            <Button onClick={() => setIsDescriptionOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
