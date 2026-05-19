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
  DollarSign, MousePointerClick, ChevronRight, RefreshCw,
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
      tiers: emittedTiers,
      donation,
    });
  }, [name, description, tags, mediaItems, productFiles, isPaid, price, currency, isRecurring, recurringInterval, ctaText, multiTier, tiers, donation]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* ─── Pricing ─── */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-zinc-700 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Pricing
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-0">
          {/* Free/Paid Toggle */}
          <button type="button"
            onClick={() => { setIsPaid(!isPaid); if (isPaid) { setIsRecurring(false); setPrice(""); } }}
            className="w-full flex items-center justify-between hover:bg-zinc-50 rounded-md px-2 py-3 -mx-2 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-zinc-400" />
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-zinc-700">{isPaid ? "Paid Product" : "Free Product"}</span>
                <span className="text-xs text-zinc-400">{isPaid ? "Customers will pay to access" : "Available at no cost"}</span>
              </div>
            </div>
            <Switch checked={isPaid} onCheckedChange={checked => { setIsPaid(checked); if (!checked) { setIsRecurring(false); setPrice(""); } }}
              onClick={e => e.stopPropagation()} />
          </button>

          {/* Pricing body — depends on isPaid AND whether multi-tier mode is on */}
          <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", isPaid ? "max-h-[2000px] opacity-100 mt-2" : "max-h-0 opacity-0")}>
            {showTiers && (
              <button
                type="button"
                onClick={() => setMultiTier(v => !v)}
                className="w-full flex items-center justify-between hover:bg-zinc-50 rounded-md px-2 py-3 -mx-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-zinc-400" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-zinc-700">Advanced pricing</span>
                    <span className="text-xs text-zinc-400">
                      {multiTier ? "Multiple tiers + donations" : "One price for everyone"}
                    </span>
                  </div>
                </div>
                <Switch checked={!!multiTier} onCheckedChange={v => setMultiTier(v)} onClick={e => e.stopPropagation()} />
              </button>
            )}

            {!multiTier && (
              <div className="space-y-3 px-2 pt-2">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.code} - {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Price ({getCurrencySymbol(currency)})</Label>
                  <Input type="number" min={0} step={0.01} value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00"
                    error={showErrors && isPaid && (!price || parseFloat(price) <= 0) ? "Price is required for paid products" : undefined}
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>

                {/* Subscription (single-price mode only — multi-tier handles it per-tier) */}
                <button type="button" onClick={() => setIsRecurring(!isRecurring)}
                  className="w-full flex items-center justify-between hover:bg-zinc-50 rounded-md px-2 py-3 -mx-2 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="h-5 w-5 text-zinc-400" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium text-zinc-700">Subscription</span>
                      <span className="text-xs text-zinc-400">{isRecurring ? "Recurring billing" : "One-time payment"}</span>
                    </div>
                  </div>
                  <Switch checked={isRecurring} onCheckedChange={setIsRecurring} onClick={e => e.stopPropagation()} />
                </button>
                {isRecurring && (
                  <div className="space-y-2 px-2">
                    <Label>Billing Interval</Label>
                    <Select value={recurringInterval} onValueChange={v => setRecurringInterval(v as "monthly" | "yearly")}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {multiTier && showTiers && (
              <div className="pt-3">
                <ProductTiersAndDonations
                  tiers={tiers}
                  onTiersChange={setTiers}
                  donation={donation}
                  onDonationChange={setDonation}
                  showErrors={showErrors}
                />
              </div>
            )}
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
