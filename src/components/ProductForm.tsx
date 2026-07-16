"use client";

import { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { EventTags } from "../ui/event-tags";
import { RichTextEditor } from "../ui/rich-text-editor";
import { SortableMediaGallery, type MediaItem } from "../ui/sortable-media-gallery";
import { FileUploadZone, type UploadedFile } from "../ui/file-upload-zone";
import { cn } from "../ui/utils";
import { PriceEditModal } from "./PriceEditModal";
import { ProductManagementConfigProvider } from "../config";
import { type DraftTier, type DonationDraft } from "./PriceEditModal/types";
import { blankTier, blankDonation } from "./PriceEditModal/helpers";
import {
  FileText, Tag as TagIcon, Package,
  DollarSign, MousePointerClick, ChevronRight,
  Eye, EyeOff, UserCheck, Lock, ClipboardCheck,
  Image as ImageIcon, Plus, Check,
} from "lucide-react";

// draftMode makes ZERO API calls (mount fetch, member-pricing fetch, and
// FormStep's load/persist are all gated on `!draftMode` or a saved tier id),
// so the create-time wizard needs only a stub config to satisfy
// useProductManagementConfig — no provider wiring in the consumer apps. The
// real connected-Stripe check happens at the parent's create-product submit.
const DRAFT_CONFIG_STUB = {
  apiBaseUrl: "",
  authHeaders: () => ({}),
  stripeConnectUrl: () => "",
};

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
   * Buyer-approval gate. When true, a purchase lands in PENDING escrow until
   * the seller approves (paid → funds held; free → entitlement gate). Mirrors
   * the event Require-Approval toggle; backend column products.requiresApproval.
   */
  requiresApproval?: boolean;
  /**
   * Tier list — populated only when the consumer renders this form with
   * `showTiers={true}` AND the user has flipped on multi-tier mode.
   * Single-price mode leaves this empty and uses `price` / `currency`
   * instead. The two modes are mutually exclusive; the backend rejects
   * a payload that sends both.
   */
  tiers: DraftTier[];
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
  /**
   * When true, the built-in Visibility section (viewability + accessibility)
   * is NOT rendered — the consumer takes over rendering it elsewhere (e.g. a
   * right-column config panel) and owns those two values at submit. The form
   * still emits its default PUBLIC/PUBLIC in onChange; the consumer overrides.
   */
  hideVisibility?: boolean;
  /**
   * When true, the built-in Buyer-approval section is NOT rendered — the
   * consumer owns the requireApproval toggle elsewhere (e.g. a shared
   * "Product Options" config card) and stamps it at submit. The form still
   * emits `requiresApproval` in onChange; the consumer overrides. Mirrors
   * hideVisibility.
   */
  hideApproval?: boolean;
}

// ─── Component ─────────────────────────────────────────────────

export function ProductForm({ communityTag, initialData, onChange, showErrors, showTiers, hideVisibility, hideApproval }: ProductFormProps) {
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
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval || false);

  // Multi-tier mode — opt-in even when `showTiers` is true. Single-price
  // stays the default so the simple "I just want one price" path doesn't
  // get blown up with tier cards.
  const [multiTier, setMultiTier] = useState(initialData?.tiers && initialData.tiers.length > 0);
  const [tiers, setTiers] = useState<DraftTier[]>(initialData?.tiers && initialData.tiers.length > 0 ? initialData.tiers : [blankTier({ currency })]);
  const [donation, setDonation] = useState<DonationDraft>(initialData?.donation || blankDonation(currency));

  // UI state
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isCtaOpen, setIsCtaOpen] = useState(false);
  // Tier wizard (the shared PriceEditModal in draftMode). Opened from the
  // Advanced-pricing summary row; commits drafts back into `tiers`/`donation`.
  const [showTierModal, setShowTierModal] = useState(false);
  // Which tier the modal opens on (edit an existing one, or a freshly-added
  // blank). The tier LIST lives inline in this form now, so the modal jumps
  // straight to the per-tier edit screen.
  const [editTierLocalId, setEditTierLocalId] = useState<string | undefined>(undefined);
  const openTierEditor = (localId: string) => { setMultiTier(true); setEditTierLocalId(localId); setShowTierModal(true); };
  const addAndEditTier = () => {
    const nt = blankTier({ currency });
    setTiers(prev => [...prev, nt]);
    openTierEditor(nt.localId);
  };

  // Notify parent
  useEffect(() => {
    // Pricing is set entirely through the tier wizard now (parity with events),
    // so there is no Free/Paid toggle: "paid" is DERIVED from the tiers. A
    // product is paid iff a configured (named, non-deleted) tier actually
    // charges — a fixed price > 0 or PWYW. A free/blank seed tier keeps the
    // product free and emits no tiers, so a consumer gating on
    // `isPaid && tiers.length` correctly submits it as a free product; a paid
    // configuration emits the full tier set for draftTiersToCreatePayload.
    const named = tiers.filter(t => !t.deleted && t.name.trim());
    const paid = named.some(t => t.priceMode === "pwyw" || (!!t.price && parseFloat(t.price) > 0));
    onChange?.({
      name, description, tags, mediaItems, productFiles,
      isPaid: paid,
      price: "",
      currency,
      isRecurring: false,
      recurringInterval, ctaText,
      viewability, accessibility, requiresApproval,
      tiers: paid ? named : [],
      donation,
    });
  }, [name, description, tags, mediaItems, productFiles, currency, recurringInterval, ctaText, viewability, accessibility, requiresApproval, tiers, donation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Configured tiers drive the Pricing row summary + tier cards. A blank
  // seed tier ("Standard") counts once the user has named it.
  const configuredTiers = tiers.filter(t => !t.deleted && t.name.trim());

  return (
    <div className="space-y-6">
      {/* ─── Product name — big inline title (borderless, matches event) ─── */}
      <div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Product Name"
          className="w-full text-[28px] font-bold text-zinc-900 placeholder:text-zinc-300 bg-transparent border-none outline-none p-0 leading-tight" />
        {showErrors && !name.trim() && (
          <p className="text-[13px] text-amber-600 mt-2 flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2zm0-6h2v4h-2z" /></svg>
            Give your product a name
          </p>
        )}
      </div>

      {/* ─── Media hero ─── prominent cover + thumbnail strip; opens the
           gallery editor. Cover uses object-cover on a fixed aspect ratio so
           photos FILL without distorting (WYSIWYG with the marketplace card),
           never stretched. */}
      <div>
        <button type="button" onClick={() => setIsGalleryOpen(true)}
          className={`group relative block w-full aspect-[16/10] rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${mediaItems[0]?.url ? "ring-1 ring-zinc-100 hover:ring-zinc-200 hover:shadow-[0_16px_34px_-18px_rgba(60,40,30,0.5)]" : "bg-zinc-50 border-2 border-dashed border-zinc-200 hover:border-zinc-300"}`}>
          {mediaItems[0]?.url ? (
            <>
              <img src={mediaItems[0].url} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-wide bg-white/85 backdrop-blur-sm text-zinc-800 px-2.5 py-1 rounded-full">Cover</span>
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/25 text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <ImageIcon className="h-[18px] w-[18px]" /> Change cover
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-zinc-400 transition-colors group-hover:text-zinc-500">
              <div className="w-12 h-12 rounded-2xl bg-white ring-1 ring-zinc-100 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <ImageIcon className="h-6 w-6 text-zinc-300" />
              </div>
              <span className="text-[13px] font-medium">Add photos</span>
              <span className="text-[11px] text-zinc-300">Up to 5 · the first is your cover</span>
            </div>
          )}
        </button>
        {mediaItems.length > 0 && (
          <>
            <div className="flex gap-2.5 mt-2.5">
              {mediaItems.slice(1, 5).map((m, i) => (
                <button type="button" key={m.id ?? i} onClick={() => setIsGalleryOpen(true)}
                  className="w-16 h-16 rounded-xl overflow-hidden ring-1 ring-zinc-100 transition-all duration-150 hover:-translate-y-0.5 hover:scale-[1.04] hover:ring-zinc-200 cursor-pointer">
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {mediaItems.length < 5 && (
                <button type="button" onClick={() => setIsGalleryOpen(true)} aria-label="Add photo"
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-zinc-300 border-2 border-dashed border-zinc-200 transition-all duration-150 hover:text-zinc-500 hover:border-zinc-300 hover:-translate-y-0.5 hover:scale-[1.04] cursor-pointer">
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>
            <p className="text-[12px] text-zinc-400 mt-2.5">{mediaItems.length} of 5 photos · the first is your cover · drag to reorder</p>
          </>
        )}
      </div>

      {/* ─── Detail rows — done-states (check + snippet when filled) + hover
           motion. The whole row lifts on hover; the chevron nudges right. ─── */}
      <div className="space-y-2.5">
        <button type="button" onClick={() => setIsDescriptionOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {description.replace(/<[^>]*>/g, "").trim() ? (
            <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
          ) : <FileText className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${description.replace(/<[^>]*>/g, "").trim() ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{description.replace(/<[^>]*>/g, "").trim() ? "Description" : "Add description"}</span>
            {description.replace(/<[^>]*>/g, "").trim() && <span className="block text-[12.5px] text-zinc-500 truncate">{description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</span>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>

        <button type="button" onClick={() => setIsTagsOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {tags.length > 0 ? (
            <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
          ) : <TagIcon className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${tags.length > 0 ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{tags.length > 0 ? "Tags" : "Add tags"}</span>
            {tags.length > 0 && <span className="block text-[12.5px] text-zinc-500 truncate">{tags.map(t => t.name).join(" · ")}</span>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>

        <button type="button" onClick={() => setIsFilesOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {productFiles.length > 0 ? (
            <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
          ) : <Package className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${productFiles.length > 0 ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{productFiles.length > 0 ? "Files" : "Add files"}<span className="font-normal text-zinc-400 text-[12.5px]">{productFiles.length > 0 ? "" : " · optional"}</span></span>
            {productFiles.length > 0 && <span className="block text-[12.5px] text-zinc-500 truncate">{productFiles.length} file{productFiles.length > 1 ? "s" : ""} attached</span>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>

        <button type="button" onClick={() => setIsCtaOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {ctaText.trim() ? (
            <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
          ) : <MousePointerClick className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${ctaText.trim() ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{ctaText.trim() ? "Button label" : "Button label"}<span className="font-normal text-zinc-400 text-[12.5px]">{ctaText.trim() ? "" : " · optional"}</span></span>
            {ctaText.trim() && <span className="block text-[12.5px] text-zinc-500 truncate">&ldquo;{ctaText}&rdquo;</span>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>
      </div>

      {/* ─── Product Options ─── one card, hairline-divided rows (mirrors the
           event "Event Options" card). Pricing is the first row and opens the
           SAME tier wizard events use. Visibility rows drop when
           `hideVisibility`; the approval row drops when `hideApproval`. */}
      {(showTiers || !hideVisibility || !hideApproval) && (
        <div>
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Product Options</p>
          <div className="rounded-2xl bg-white ring-1 ring-zinc-100 divide-y divide-zinc-100 overflow-hidden">
            {/* Pricing — identical treatment to the event "Tickets" row:
                summary + tier cards + a dashed button into the shared wizard. */}
            {showTiers && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-[18px] w-[18px] text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-800">Pricing</span>
                  </div>
                  <span className="text-xs text-zinc-400">{configuredTiers.length === 0 ? "Free" : `${configuredTiers.length} tier${configuredTiers.length > 1 ? "s" : ""}`}{donation.enabled ? " · Donations" : ""}</span>
                </div>
                {configuredTiers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {configuredTiers.map((t, i) => (
                      <button type="button" key={i} onClick={() => openTierEditor(t.localId)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer text-left">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200 text-zinc-600">
                          <DollarSign className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-zinc-800 truncate">{t.name.trim() || "Unnamed tier"}</p>
                          <p className="text-[11px] text-zinc-400">{t.price && parseFloat(t.price) > 0 ? `${getCurrencySymbol(t.currency)}${t.price}` : "Free"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={addAndEditTier}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium text-zinc-500 hover:text-zinc-700 border border-dashed border-zinc-200 hover:border-zinc-300 rounded-xl cursor-pointer transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {configuredTiers.length === 0 ? "Set pricing" : "Add pricing tier"}
                </button>
              </div>
            )}
            {!hideVisibility && (
              <>
                {/* Visibility — who can SEE the listing */}
                <div
                  onClick={() => setViewability(viewability === "PUBLIC" ? "MEMBERS_ONLY" : "PUBLIC")}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {viewability === "PUBLIC" ? <Eye className="h-[18px] w-[18px] text-zinc-400 shrink-0" /> : <EyeOff className="h-[18px] w-[18px] text-zinc-400 shrink-0" />}
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-zinc-800">Visibility: {viewability === "PUBLIC" ? "Public" : "Members only"}</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">Who can see this product listing</p>
                    </div>
                  </div>
                  <Switch checked={viewability === "MEMBERS_ONLY"} onCheckedChange={v => setViewability(v ? "MEMBERS_ONLY" : "PUBLIC")} onClick={e => e.stopPropagation()} />
                </div>
                {/* Purchase — who can BUY */}
                <div
                  onClick={() => setAccessibility(accessibility === "PUBLIC" ? "MEMBERS_ONLY" : "PUBLIC")}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {accessibility === "PUBLIC" ? <UserCheck className="h-[18px] w-[18px] text-zinc-400 shrink-0" /> : <Lock className="h-[18px] w-[18px] text-zinc-400 shrink-0" />}
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-zinc-800">Purchase: {accessibility === "PUBLIC" ? "Public" : "Members only"}</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">Who can buy this product</p>
                    </div>
                  </div>
                  <Switch checked={accessibility === "MEMBERS_ONLY"} onCheckedChange={v => setAccessibility(v ? "MEMBERS_ONLY" : "PUBLIC")} onClick={e => e.stopPropagation()} />
                </div>
              </>
            )}
            {!hideApproval && (
              /* Require approval — buyer applies, seller approves (escrow held) */
              <div
                onClick={() => setRequiresApproval(!requiresApproval)}
                className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <ClipboardCheck className="h-[18px] w-[18px] text-zinc-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800">Require approval</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Buyers apply and you approve before they get access. Their payment is held until you decide.</p>
                  </div>
                </div>
                <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} onClick={e => e.stopPropagation()} />
              </div>
            )}
          </div>
        </div>
      )}


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

      {/* ─── Tags Modal ─── (matches the event Tags tap-row → modal) */}
      <Dialog open={isTagsOpen} onOpenChange={setIsTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Product Tags</DialogTitle>
            <DialogDescription>Add tags to help people discover your product.</DialogDescription>
          </DialogHeader>
          <EventTags selectedTags={tags} onTagsChange={setTags} placeholder="Search or create tags..." />
          <DialogFooter>
            <Button onClick={() => setIsTagsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Gallery Modal ─── (cover square → full sortable gallery) */}
      <Dialog open={isGalleryOpen} onOpenChange={setIsGalleryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Product Photos</DialogTitle>
            <DialogDescription>Add up to 5 photos. The first is the cover.</DialogDescription>
          </DialogHeader>
          <SortableMediaGallery items={mediaItems} onChange={setMediaItems} maxItems={5} />
          <DialogFooter>
            <Button onClick={() => setIsGalleryOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Files Modal ─── (digital delivery) */}
      <Dialog open={isFilesOpen} onOpenChange={setIsFilesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Product Files</DialogTitle>
            <DialogDescription>Buyers download these after purchase.</DialogDescription>
          </DialogHeader>
          <FileUploadZone files={productFiles} onChange={setProductFiles} maxFiles={10} />
          <DialogFooter>
            <Button onClick={() => setIsFilesOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Button Label Modal ─── (CTA text) */}
      <Dialog open={isCtaOpen} onOpenChange={setIsCtaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Button Label</DialogTitle>
            <DialogDescription>The action button on your product card. Default: &ldquo;Buy Now&rdquo;. Max 15 characters.</DialogDescription>
          </DialogHeader>
          <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="Buy Now" maxLength={15} />
          <DialogFooter>
            <Button onClick={() => setIsCtaOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tier wizard (draftMode) ─── the same PriceEditModal events use,
          seeded from this form's own draft state. draftMode → no API calls;
          on Save it hands the drafts back via onDraftCommit and the parent
          POSTs them as part of the create-product payload. Member-pricing +
          forms that need a saved tier id show "Save tier first" and are
          configured post-create in edit mode. */}
      {showTierModal && (
        <ProductManagementConfigProvider value={DRAFT_CONFIG_STUB}>
          <PriceEditModal
            product={{ price: 0, currency, isRecurring, recurringInterval }}
            communityTag={communityTag}
            productId=""
            draftMode
            initialDraftTiers={tiers}
            initialDraftDonation={donation}
            openTierLocalId={editTierLocalId}
            onDraftCommit={({ tiers: nextTiers, donation: nextDonation }) => {
              setTiers(nextTiers);
              setDonation(nextDonation);
            }}
            onClose={() => setShowTierModal(false)}
            onSaved={() => setShowTierModal(false)}
            showToast={() => {}}
            showMemberPricing={false}
          />
        </ProductManagementConfigProvider>
      )}
    </div>
  );
}
