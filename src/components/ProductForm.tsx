"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { EventTags } from "../ui/event-tags";
import { descriptionToPlainText } from "../lib/htmlToPlainText";
import { LISTING_NAME_MAX, NAME_COUNTER_FROM, listingNameTooLong } from "../lib/listingNameLimit";
import { dataUrlToFile } from "../lib/dataUrlToFile";
import { MarkdownEditor } from "../ui/markdown-editor";
import { type MediaItem } from "../ui/sortable-media-gallery";
import { BannerCropModal, type BannerCropResult } from "../ui/banner-crop-modal";
import { type UploadedFile } from "../ui/file-upload-zone";
import { cn } from "../ui/utils";
import { PriceEditModal } from "./PriceEditModal";
import { ProductManagementConfigProvider } from "../config";
import { type DraftTier, type DonationDraft } from "./PriceEditModal/types";
import { blankTier, blankDonation } from "./PriceEditModal/helpers";
import { DonationsField } from "./PriceEditModal/DonationsField";
import { CategoryPickerRow, type CategoryOption } from "./CategoryPickerRow";
import { WizardStepBanner, DismissibleTipBanner } from "./wizard-banners";
import { useStripeStatus } from "../lib/useStripeStatus";
import {
  type ProductConditionValue, type ParcelClassValue,
} from "./PhysicalDetailsFields";
import {
  MembershipTierPicker,
  toTierAccessValue,
  fromTierAccessValue,
  tierAccessSummary,
  ceilingFor,
  clampToCeiling,
  tierAccessConsequence,
  type TierAccessValue,
  type MembershipTier,
  PolicyIcon,
  AudienceMeter,
  tierAccessLevel,
  RefundPolicyField,
  type RefundPolicyValue,
  DiscardPrompt,
  ConfirmLeaveModal,
} from "@cobuntu/management-ui-shared";
import {
  FileText, Tag as TagIcon,
  Layers, MousePointerClick, ChevronRight,
  Eye, EyeOff, UserCheck, Shield, ShieldCheck, Repeat,
  Image as ImageIcon, Plus, Check, X,
  PenLine, Wallet, Gift, CreditCard, AlertCircle,
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

/**
 * The variant row's price line and fact strip (feat/variant-row-facts).
 *
 * Sellers were missing that capacity, files, a licence and stock are configured
 * INSIDE a variant — the row only showed a name + price, so those felt absent.
 * The card now surfaces whatever the variant has set, so the properties are
 * visible and the row plainly reads "open me to edit". Facts render only when
 * present, so a bare free variant stays a one-liner.
 */
function variantPriceLabel(t: DraftTier): string {
  if (t.priceMode === "pwyw") return "Pay what you want";
  const p = parseFloat(t.price);
  if (!t.price || Number.isNaN(p) || p <= 0) return "Free";
  const base = `${getCurrencySymbol(t.currency)}${t.price}`;
  return t.isRecurring ? `${base}/${t.recurringInterval || "mo"}` : base;
}
/**
 * The fact strip under each variant card.
 *
 * Curated-always, rest when-set: the core properties a buyer should learn ARE
 * editable (so they discover them) show even when unset — "Capacity: Unlimited",
 * "Sign-up form: Not set". The niche / type-specific ones only appear once set,
 * so the strip teaches without turning into clutter.
 *
 * Type-aware: "Files" and "Licence" are digital-only, so on a PHYSICAL product
 * they are dropped (showing "Files: None" on a boxed item would mislead, not
 * teach). Condition/Postage are the physical-shape fields and stay when-set per
 * the product decision.
 */
function variantFacts(t: DraftTier, isPhysical: boolean): { k: string; v: string }[] {
  const out: { k: string; v: string }[] = [];

  // ── Curated — always shown, so buyers discover the knob even when it's unset.
  const cap = parseInt(t.capacity, 10);
  out.push({ k: "Capacity", v: (t.capacity && !Number.isNaN(cap) && cap > 0) ? String(cap) : "Unlimited" });

  if (!isPhysical) {
    const fileCount = (t.files?.length ?? 0) + (t.links?.length ?? 0);
    out.push({ k: "Files", v: fileCount > 0 ? String(fileCount) : "None" });
    out.push({ k: "Licence", v: (t.licenseTerms && t.licenseTerms.trim()) ? "Set" : "Not set" });
  }

  const formCount = t.draftForm?.fields?.length ?? t.formFieldCount ?? 0;
  out.push({ k: "Sign-up form", v: formCount > 0 ? `${formCount} question${formCount === 1 ? "" : "s"}` : "Not set" });

  // ── Niche / type-specific — only once set, to keep the strip from bloating.
  const dl = parseInt(t.maxDownloads, 10);
  if (!isPhysical && t.maxDownloads && !Number.isNaN(dl) && dl > 0) out.push({ k: "Downloads", v: `${dl} max` });
  if (isPhysical && t.condition && t.condition.trim()) out.push({ k: "Condition", v: t.condition });
  if (isPhysical && t.parcelSize && t.parcelSize.trim()) out.push({ k: "Postage", v: t.parcelSize });
  if (t.attrs && t.attrs.length > 0) out.push({ k: "Attributes", v: String(t.attrs.length) });
  return out;
}

// ─── Types ─────────────────────────────────────────────────────

interface Tag { id: string; name: string; }

/**
 * The words this form uses for the thing being sold.
 *
 * ── Why a prop and not a `noun` string ─────────────────────────────────────
 *
 * The form says "product" in six places, and the course wizard renders the
 * same form for something nobody calls a product. Passing a single noun and
 * interpolating it would produce "Add tags to help people discover your
 * course" correctly and "About your product" only by luck - the sentences
 * differ by more than one word, and a template that pretends otherwise reads
 * like a translation.
 *
 * So each string is overridable and every one defaults to what it says today.
 * A consumer that passes nothing is byte-identical to before, which is what
 * makes this safe to land under the marketplace.
 *
 * These are NOT translated, and neither are the strings they replace: this
 * package hardcodes its English. That is a real gap and a separate piece of
 * work; naming it here so the next person does not assume the override is the
 * thing that broke i18n.
 */
export interface ProductFormLabels {
  namePlaceholder?: string;
  descriptionTitle?: string;
  descriptionHint?: string;
  descriptionPlaceholder?: string;
  tagsTitle?: string;
  tagsHint?: string;
  ctaHint?: string;
  /**
   * The decorative lead-in banner above the name field (feat/wizard-presets-
   * and-banners). Not part of DEFAULT_LABELS below: its default text is
   * derived from `productType` (product vs course), not a single fixed
   * string, so it is computed inline where `productType` is in scope rather
   * than baked into this static map.
   */
  basicsBannerTitle?: string;
  basicsBannerSubtitle?: string;
  /** The banner above the pricing-step preset cards. Same reasoning as above. */
  pricingBannerTitle?: string;
  pricingBannerSubtitle?: string;
  /** The banner above the Policies & access (settings) step. Same reasoning as above. */
  settingsBannerTitle?: string;
  settingsBannerSubtitle?: string;
}

const DEFAULT_LABELS: Required<Pick<ProductFormLabels,
  "namePlaceholder" | "descriptionTitle" | "descriptionHint" | "descriptionPlaceholder" | "tagsTitle" | "tagsHint" | "ctaHint">> = {
  namePlaceholder: "Product Name",
  descriptionTitle: "Product Description",
  descriptionHint: "Describe your product. What will customers get?",
  descriptionPlaceholder: "Write your product description...",
  tagsTitle: "Product Tags",
  tagsHint: "Add tags to help people discover your product.",
  ctaHint: "The action button on your product card. Default: \u201cBuy Now\u201d. Max 15 characters.",
};

export interface ProductFormData {
  name: string;
  description: string;
  tags: Tag[];
  /** Community taxonomy. null = unfiled. Sub-category is only ever set with its parent. */
  categoryId: string | null;
  subCategoryId: string | null;
  mediaItems: MediaItem[];
  productFiles: UploadedFile[];
  /** External link deliverables staged on the form — revealed to verified
   *  buyers post-purchase (feat/create-form-link). Persisted on create via the
   *  upload job's `links` field. Empty for physical products. */
  links: { label: string; url: string }[];
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
   * Membership tiers granted view / buy access, refining the two gates above.
   *
   * EMPTY means "every tier", not "nobody" - the same rule the backend
   * applies, where no rows means unrestricted. That is what lets every
   * listing predating this feature keep working with no backfill.
   */
  viewTierIds: string[];
  buyTierIds: string[];
  /**
   * Buyer-approval gate. When true, a purchase lands in PENDING escrow until
   * the seller approves (paid → funds held; free → entitlement gate). Mirrors
   * the event Require-Approval toggle; backend column products.requiresApproval.
   */
  requiresApproval?: boolean;
  /**
   * The seller's answer to "can a buyer who owns this buy it again?", or
   * undefined when they have not given one.
   *
   * THREE states, not two, and the third is why this is optional rather than
   * defaulted. undefined means the column stays NULL, which the backend reads
   * as "work it out from the listing" (a course or a digital product with
   * files cannot be re-bought; anything else can). Emitting a concrete boolean
   * for an untouched switch would freeze that derivation for ever, on every
   * product anyone happens to open the form for.
   */
  allowRepeatPurchase?: boolean;
  /**
   * The seller's refund policy. null = Standard (platform default window);
   * { mode:'default', customBuyerWindowDays:0 } = no self-service refunds. The
   * create DTO + comprehensive update both accept it.
   */
  refundPolicy?: RefundPolicyValue;
  /**
   * The RESOLVED answer as the backend currently sees it, seeding the switch.
   * Read-only: the form never emits this. It exists so the switch can show the
   * truth for a listing whose seller has said nothing, WITHOUT this component
   * reimplementing the derivation and drifting from it.
   */
  canRepeatPurchase?: boolean;
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
  /**
   * Physical-only. NULL on every other product type, and that is enforced
   * rather than assumed: the backend normaliser THROWS if a digital product
   * carries either, so the emit below nulls them whenever productType is not
   * PHYSICAL. A consumer can append whatever this form emits without checking.
   */
  condition: ProductConditionValue | null;
  parcelClass: ParcelClassValue | null;
  // (viewability + accessibility declared above — both default PUBLIC.)
}

export interface ProductFormProps {
  communityTag: string;
  /**
   * Caller-supplied Stripe-connected status that overrides this form's own
   * internal `useStripeStatus(communityTag)` check for the "Paid" preset
   * card gating.
   *
   * Why this exists: `useStripeStatus` hits the COMMUNITY-scoped, admin-gated
   * `GET /api/communities/:communityTag/stripe/connected` endpoint. A seller
   * who has genuinely connected Stripe but is not a community admin gets a
   * 403 there, which collapses to `connected: false` — the "Paid" card then
   * shows locked even though Stripe is really connected. Host apps that
   * already know the real, USER-scoped answer (e.g. via
   * `GET /api/users/me/stripe/status`) pass it here instead of letting this
   * form re-derive a wrong one.
   *
   * Omitted → byte-identical to before: the form still calls
   * `useStripeStatus` itself and uses its result unchanged.
   */
  stripeStatusOverride?: { connected: boolean; connectUrl?: string | null };
  /**
   * Who the "Paid" / "Free with donations" Stripe gate is actually about.
   *
   * "community" (default — byte-identical to before) checks the community's
   * own Stripe account via `useStripeStatus`. "personal" is for a member/
   * personal-owned listing, where it is the SELLER's own account that matters
   * — this threads through to `useStripeStatus`'s ownerType so the internal
   * check hits `/api/users/me/stripe/status` instead of the community-scoped,
   * admin-gated endpoint. Irrelevant when `stripeStatusOverride` is supplied,
   * since the host app has already resolved the correct answer itself.
   */
  ownership?: "community" | "personal";
  /**
   * Override the words this form uses for the thing being sold.
   *
   * Omitted everywhere except the course wizard, which renders this form for
   * something nobody calls a product. Every key defaults to what it says
   * today, so an omitted prop is byte-identical to before.
   */
  labels?: ProductFormLabels;
  /**
   * The community's product categories, loaded by the CONSUMER.
   *
   * Not fetched here on purpose: the create wizard runs against a stub config
   * with an empty apiBaseUrl and makes zero API calls, which is what lets
   * consumers embed this form without wiring a provider. The row hides itself
   * when this is empty or omitted, so a community with no taxonomy sees no
   * picker rather than an empty one.
   */
  categories?: CategoryOption[];
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
   * The community's membership tiers, for the access picker. Passed in, not
   * fetched: the form makes no API calls of its own, and an empty list simply
   * renders "no membership tiers yet".
   */
  membershipTiers?: MembershipTier[];
  /** Tier ids currently granted view / buy access, from the listing. */
  initialViewTierIds?: string[];
  initialBuyTierIds?: string[];
  /**
   * When true, the built-in Buyer-approval section is NOT rendered — the
   * consumer owns the requireApproval toggle elsewhere (e.g. a shared
   * "Product Options" config card) and stamps it at submit. The form still
   * emits `requiresApproval` in onChange; the consumer overrides. Mirrors
   * hideVisibility.
   */
  hideApproval?: boolean;
  /**
   * When true, the "Can be bought more than once" (repeat-purchase) row is NOT
   * rendered AND the form stamps `allowRepeatPurchase: false` in onChange.
   *
   * For COURSES: a course is always bought once — a second purchase grants a
   * learner nothing new — so the toggle is a decision with one right answer.
   * Hiding it removes the clutter and guarantees the correct value regardless of
   * any stale draft/initialData. Default false keeps products (digital/physical)
   * showing the toggle as before.
   */
  hideRepeatPurchase?: boolean;
  /**
   * What is being sold. Drives the physical-only row, and nothing else.
   *
   * Defaults to DIGITAL so every existing caller is byte-identical: the row
   * does not render and both physical fields emit null. The community app's
   * create wizard passes the seller's choice from its type step; the admin
   * passes the product's own type when editing.
   */
  productType?: "DIGITAL" | "PHYSICAL" | "COURSE";
  /**
   * When true (default), the form renders its own "Link deliverables" section
   * (staged into ProductFormData.links, persisted on create). The EDIT drawer
   * passes false — it manages links itself against the live product, so the
   * form must not render a second, conflicting section there.
   */
  showLinkDeliverables?: boolean;
  /**
   * Which half of the form to render, so a wizard can spread ONE mounted
   * instance across two steps without splitting its state:
   *   - "listing"  → name, photos, description, tags, category, CTA
   *   - "commerce" → postage/condition, stock, files, links, pricing tiers,
   *                  per-tier license, approval, community access
   *   - "all" (default) → everything, one page. The manage/edit drawer and the
   *                  admin single-page form pass nothing and get "all", so they
   *                  are unaffected.
   * Only VISIBLE blocks change; state, onChange, and every modal stay mounted
   * regardless of page, so opening a dialog on one page and switching pages
   * never loses its contents.
   */
  page?: "listing" | "commerce" | "settings" | "all";
  /**
   * Surfaces community member (tier) pricing inside the draftMode tier wizard
   * so per-segment discount overrides can be configured at CREATE time (they
   * ride the create payload, created atomically with each tier). Community-
   * owned products only — the consumer passes its own ownership signal
   * (e.g. `isCommunityOwned`). Off → the section is not rendered, matching a
   * member selling their own product. Default false.
   */
  showMemberPricing?: boolean;
}

/**
 * Names blankTier assigns by position ("Standard", "Tier 2", …). A tier still
 * carrying one of these is one the seller never renamed, so the name alone is
 * not evidence they configured anything.
 */
const AUTO_SEED_NAME = /^(Standard|Tier \d+)$/;

// ─── Component ─────────────────────────────────────────────────

export function ProductForm({ communityTag, initialData, onChange, showErrors, showTiers, hideVisibility, hideApproval, hideRepeatPurchase, categories, membershipTiers = [], initialViewTierIds, initialBuyTierIds, productType = "DIGITAL", showLinkDeliverables = true, page = "all", showMemberPricing = false, labels, stripeStatusOverride, ownership = "community" }: ProductFormProps) {
  /* Merged once rather than at each use, so a partial override cannot leave
   * one string reading "course" beside another still reading "product". */
  const L = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  /*
   * The product/course copy-swap mechanism, reused rather than reinvented.
   *
   * `productType === "COURSE"` is the SAME flag `hideRepeatPurchase` already
   * keys off of above (the course wizard passes it for the identical reason:
   * one form, two nouns). The two new wizard banners below interpolate this
   * noun into their default copy instead of hardcoding "product", while
   * still going through `labels` first so a consumer can override the exact
   * wording (e.g. a non-English-shaped sentence) without this component
   * needing to know every caller's phrasing.
   */
  const noun = productType === "COURSE" ? "course" : "product";
  const basicsBannerTitle = labels?.basicsBannerTitle ?? "Let's start with the basics";
  const basicsBannerSubtitle = labels?.basicsBannerSubtitle ?? `Give your ${noun} a name people will recognize`;
  const pricingBannerTitle = labels?.pricingBannerTitle ?? `Configure your ${noun}'s business model`;
  const pricingBannerSubtitle = labels?.pricingBannerSubtitle ?? "Choose how people can get access. You can change these later.";
  const settingsBannerTitle = labels?.settingsBannerTitle ?? `Set your ${noun}'s policies`;
  const settingsBannerSubtitle = labels?.settingsBannerSubtitle ?? "Choose how buyers interact with it. You can change these later.";
  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  // Collapsed-row preview. htmlToPlainText, not an inline tag-strip: the rich
  // text editor emits &nbsp; for runs of spaces, and stripping tags alone left
  // those entities rendering literally as "Test&nbsp;product" in the row under
  // the field the seller had just filled in (reported 2026-08-08).
  const descriptionPreview = descriptionToPlainText(description);
  const [tags, setTags] = useState<Tag[]>(initialData?.tags || []);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialData?.mediaItems || []);
  // Deliverables (files / external links / licence) now live INSIDE each
  // variant (VariantEditView), not at the product level, so the old
  // product-level productFiles / links state and their modals are gone. The
  // ProductFormData fields remain (other code may reference the type) but the
  // form emits them as empty arrays — the per-tier data travels on `tiers`.
  const [isPaid, setIsPaid] = useState(initialData?.isPaid || false);
  const [price, setPrice] = useState(initialData?.price || "");
  const [currency, setCurrency] = useState(initialData?.currency || "USD");
  const [isRecurring, setIsRecurring] = useState(initialData?.isRecurring || false);
  const [recurringInterval, setRecurringInterval] = useState<"monthly" | "yearly">(initialData?.recurringInterval || "monthly");
  const [ctaText, setCtaText] = useState(initialData?.ctaText || "");
  const [viewability, setViewability] = useState<"PUBLIC" | "MEMBERS_ONLY">(initialData?.viewability || "PUBLIC");
  /*
   * The picker's own shape. MEMBERS_ONLY with no granted tiers reads as "all
   * members", never as an empty selection - the no-backfill rule surfacing in
   * the UI, and why every product that predates this opens as All members.
   */
  const [viewAccess, setViewAccess] = useState<TierAccessValue>(
    toTierAccessValue(initialData?.viewability ?? "PUBLIC", initialViewTierIds),
  );
  const [buyAccess, setBuyAccess] = useState<TierAccessValue>(
    toTierAccessValue(initialData?.accessibility ?? "PUBLIC", initialBuyTierIds),
  );
  /* One translation for both the payload and the icons, so they cannot drift. */
  const viewResolved = fromTierAccessValue(viewAccess);
  const buyResolved = fromTierAccessValue(buyAccess);
  /*
   * ── Buying is a subset of seeing ──────────────────────────────────
   *
   * These were two independent pieces of state, so "visible to Founding
   * only" plus "anyone can buy it" was reachable and saveable. Not a hole -
   * the view gate runs first, so a non-member never reaches the buy button -
   * but the card asserted something untrue, and whoever set it believed they
   * had opened sales to the public.
   *
   * The buy picker is handed a ceiling instead of being validated after the
   * fact: an option the view setting excludes is never offered. Narrowing
   * view drags buy back with it, which is why view goes through a setter
   * rather than being set directly.
   */
  const buyCeiling = ceilingFor(viewAccess);
  const changeViewAccess = (next: TierAccessValue) => {
    setViewAccess(next);
    setBuyAccess((prev) => clampToCeiling(prev, ceilingFor(next)));
  };
  const [accessibility, setAccessibility] = useState<"PUBLIC" | "MEMBERS_ONLY">(initialData?.accessibility || "PUBLIC");
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval || false);
  /*
   * Refund policy, seeded from initialData so an untouched form re-emits exactly
   * what the product already had (no accidental reset on edit). null = Standard
   * (platform default); { customBuyerWindowDays: 0 } = no self-service refunds.
   * The create DTO + the comprehensive update both accept `refundPolicy`.
   */
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicyValue>(
    (initialData as { refundPolicy?: RefundPolicyValue } | undefined)?.refundPolicy ?? null,
  );
  /*
   * undefined until the seller touches it, so an untouched switch emits
   * NOTHING and the column stays NULL. `??` and not `||`: an existing "no"
   * is false, and `||` would read that as untouched and silently re-derive it.
   */
  const [allowRepeatPurchase, setAllowRepeatPurchase] = useState<boolean | undefined>(
    initialData?.allowRepeatPurchase,
  );
  /* What the switch SHOWS: the seller's answer if they gave one, else the
     backend's resolved value, else yes. Never a local re-derivation. */
  const repeatShown = allowRepeatPurchase ?? initialData?.canRepeatPurchase ?? true;

  // Multi-tier mode — opt-in even when `showTiers` is true. Single-price
  // stays the default so the simple "I just want one price" path doesn't
  // get blown up with tier cards.
  const [multiTier, setMultiTier] = useState(initialData?.tiers && initialData.tiers.length > 0);
  const [tiers, setTiers] = useState<DraftTier[]>(initialData?.tiers && initialData.tiers.length > 0 ? initialData.tiers : [blankTier({ currency })]);
  const [donation, setDonation] = useState<DonationDraft>(initialData?.donation || blankDonation(currency));

  /*
   * ── Pricing presets ("Free" / "Paid" / "Free with donations") ──────────
   *
   * A three-card quick-setup row above the variant list, so a seller who
   * just wants "free" or "paid" never has to open the tier editor to get
   * there. It writes the SAME state the tier editor and the donations field
   * write (tiers[].price, donation.enabled) — there is no separate preset
   * state to drift from the real config.
   */
  type PricingPreset = "free" | "paid" | "donations";

  /*
   * Dirty = the seller has touched tier/donation config manually (via the
   * tier editor or the donations field) since the last preset applied.
   * Pristine (false) is also true on first render, before anything has been
   * configured at all — a fresh "Standard" / price "0" tier has nothing to
   * lose, so the very first preset tap should never need a confirm.
   */
  const [pricingDirty, setPricingDirty] = useState(false);
  /* The preset awaiting a discard-confirm, or null when none is pending. */
  const [pendingPreset, setPendingPreset] = useState<PricingPreset | null>(null);
  /* Confirm before leaving the wizard for Stripe Connect onboarding — a
     seller tapping "Paid" with no warning and landing on another site was a
     jarring pattern interrupt (feedback). */
  const [confirmingStripeLeave, setConfirmingStripeLeave] = useState(false);

  /*
   * Derived fresh on every render from the actual tier/donation state —
   * never written to directly — so the card highlight cannot disagree with
   * what the tier editor or the donations field just changed underneath it.
   * Checked against the FIRST tier only: presets are a single-price quick
   * path, and a seller who has gone multi-tier with divergent prices has
   * moved past what three cards can represent (their variants keep working;
   * the cards just stop claiming to summarize them precisely).
   */
  function pricingPresetFor(ts: DraftTier[], d: DonationDraft): PricingPreset {
    const p = parseFloat(ts[0]?.price ?? "0");
    const hasPrice = !Number.isNaN(p) && p > 0;
    // Paid wins even with donations also enabled — spelled out in the spec
    // this implements: a paid tier plus donations is closest to "Paid".
    if (hasPrice) return "paid";
    return d.enabled ? "donations" : "free";
  }
  const activePricingPreset = pricingPresetFor(tiers, donation);

  function applyPricingPreset(preset: PricingPreset) {
    if (preset === "paid") {
      // Never fabricate a price. A tier that already has one keeps it;
      // an unpriced/free one is cleared to "" so the seller's own number is
      // the first thing that lands there, not an invented default.
      const firstTierHadNoPrice = !(parseFloat(tiers[0]?.price || "0") > 0);
      setTiers((ts) => ts.map((t) => ({
        ...t,
        price: parseFloat(t.price || "0") > 0 ? t.price : "",
      })));
      setDonation((d) => ({ ...d, enabled: false }));
      /*
       * Clearing the price leaves the card un-highlighted (the derived
       * "selected" state only flips once a price > 0 exists) and nothing
       * else on screen changes -- tapping "Paid" looked like it did nothing
       * (feedback). Opening the price editor right away gives the seller
       * somewhere to actually type the amount, instead of a silent no-op.
       */
      if (firstTierHadNoPrice && tiers[0]) openTierEditor(tiers[0].localId);
    } else {
      setTiers((ts) => ts.map((t) => ({ ...t, price: "0" })));
      setDonation((d) => ({ ...d, enabled: preset === "donations" }));
    }
    setPricingDirty(false);
  }

  /*
   * The tap handler every preset card calls. Applies immediately when there
   * is nothing to lose (pristine, or the tapped preset is already the active
   * one) and only interrupts with DiscardPrompt when the seller manually
   * configured something that preset would overwrite.
   */
  function tapPricingPreset(preset: PricingPreset) {
    if (!pricingDirty || activePricingPreset === preset) {
      applyPricingPreset(preset);
      return;
    }
    setPendingPreset(preset);
  }

  /* Stripe-connected gate for the "Paid" card — see ../lib/useStripeStatus
   * for why this is a local hook rather than a cross-package dependency.
   *
   * Called UNCONDITIONALLY (even when `stripeStatusOverride` is supplied) so
   * hook-call order never depends on a prop — React requires the same hooks
   * in the same order on every render, and gating this behind a prop check
   * would violate that. When an override is passed, its result is simply not
   * used below; `stripeStatus` is computed from the override instead.
   *
   * Why an override exists at all: this hook hits the COMMUNITY-scoped,
   * admin-gated `/api/communities/:communityTag/stripe/connected` endpoint.
   * A seller with Stripe genuinely connected, but who is not a community
   * admin, gets a 403 there, which this hook correctly collapses to
   * `connected: false` for safety — but that is the WRONG answer for the
   * "Paid" preset gate, which cares whether *this seller* can charge, not
   * whether they admin the community. A host app that already computed the
   * correct user-scoped answer (e.g. via `GET /api/users/me/stripe/status`)
   * passes it as `stripeStatusOverride` instead of letting this mismatched
   * check override it. */
  const internalStripeStatus = useStripeStatus(communityTag, ownership === "personal" ? "personal" : "community");
  const stripeStatus = stripeStatusOverride
    ? {
        connected: stripeStatusOverride.connected,
        loading: false,
        known: true,
        connectUrl: stripeStatusOverride.connectUrl ?? internalStripeStatus.connectUrl,
      }
    : internalStripeStatus;

  // Dismissible "Good to know" tip at the foot of the pricing step. Local
  // state only — see wizard-banners.tsx's DismissibleTipBanner doc comment
  // for why this does not persist across remounts.
  const [pricingTipDismissed, setPricingTipDismissed] = useState(false);

  // UI state
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(initialData?.categoryId ?? null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(initialData?.subCategoryId ?? null);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isCtaOpen, setIsCtaOpen] = useState(false);

  /*
   * Condition, parcel size and stock are NOT product-level facts, and this
   * form no longer asks for them. Every one of them is a property of a single
   * VARIANT: a variant owns its own `products` row (product_tiers.productId is
   * unique) carrying condition/parcelClass/shippingPrice, and its stock is
   * `product_tiers.capacity`. The variant editor already asks for all three
   * (its "The item" block and its Stock stepper), the buyer's detail page
   * describes the SELECTED variant, and checkout charges postage off
   * `selectedTier.products.shippingPrice`.
   *
   * They used to render here for the single-variant case, hidden once Advanced
   * pricing was on. That escape hatch is gone: the redesigned form ALWAYS seeds
   * a variant ("Standard"), so there is no longer a shape where the parent row
   * is the thing being bought. Left on the form they were a second control
   * writing a row nobody reads, and a seller who set a condition here watched
   * the variant keep its own.
   *
   * `condition` / `parcelClass` are still EMITTED, unchanged, from whatever the
   * product already had. Dropping them from the payload would have this form
   * silently clear a stored value on every edit, which is a different bug.
   */
  const condition = initialData?.condition ?? null;
  const parcelClass: ParcelClassValue = initialData?.parcelClass ?? "STANDARD";
  const isPhysical = productType === "PHYSICAL";

  // ─── Inline photo upload ───
  // Tap a slot → native device picker (our own hidden input) → the square
  // cropper (the only popup) → the photo lands in the carousel. No separate
  // "Product Photos" gallery popup. cropEditIndex null = adding a new photo;
  // a number = re-cropping the photo at that index.
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropEditIndex, setCropEditIndex] = useState<number | null>(null);
  const mediaSrc = (m?: MediaItem) => m?.preview || m?.url || "";

  function pickPhoto() {
    setCropEditIndex(null);
    photoInputRef.current?.click();
  }
  function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCropSrc(reader.result as string); setCropOpen(true); };
    reader.readAsDataURL(file);
  }
  function recropPhoto(index: number) {
    const m = mediaItems[index];
    if (!m) return;
    setCropEditIndex(index);
    setCropSrc(mediaSrc(m));
    setCropOpen(true);
  }
  function onCropSave(result: BannerCropResult) {
    if (!result.base64) return;
    /*
     * Rebuild an uploadable File from the crop.
     *
     * The original File is already gone here — onPhotoFile only reads it to
     * get a src for the cropper — and the cropper returns base64 alone. The
     * consumer uploads `item.file` and skips items without one, so a photo
     * added with no File attached rendered in the carousel and was then
     * silently dropped at submit: products saved with no images.
     * Reported 2026-08-09.
     */
    const file = dataUrlToFile(result.base64, `photo-${Date.now()}`);
    if (cropEditIndex === null) {
      setMediaItems([...mediaItems, { id: crypto.randomUUID(), preview: result.base64, type: "image" as const, file }].slice(0, 5));
    } else {
      const next = [...mediaItems];
      // Re-cropping an EXISTING (already hosted) photo has to replace its file
      // too, or the upload keeps the pre-crop image while the carousel shows
      // the cropped one.
      if (next[cropEditIndex]) next[cropEditIndex] = { ...next[cropEditIndex], preview: result.base64, file };
      setMediaItems(next);
    }
  }
  function removePhoto(index: number) {
    setMediaItems(mediaItems.filter((_, i) => i !== index));
  }
  function makeCover(index: number) {
    if (index <= 0 || !mediaItems[index]) return;
    const next = [...mediaItems];
    const [m] = next.splice(index, 1);
    next.unshift(m);
    setMediaItems(next);
  }
  // Tier wizard (the shared PriceEditModal in draftMode). Opened from the
  // Advanced-pricing summary row; commits drafts back into `tiers`/`donation`.
  const [showTierModal, setShowTierModal] = useState(false);
  // Which tier the modal opens on (edit an existing one, or a freshly-added
  // blank). The tier LIST lives inline in this form now, so the modal jumps
  // straight to the per-tier edit screen.
  const [editTierLocalId, setEditTierLocalId] = useState<string | undefined>(undefined);
  const openTierEditor = (localId: string) => { setMultiTier(true); setEditTierLocalId(localId); setShowTierModal(true); };

  /**
   * A tier being added but not yet committed.
   *
   * It is NOT written into `tiers` up front. It used to be — addAndEditTier
   * appended a blankTier and then opened the modal — and since the modal's
   * direct-open footer says "Cancel" and only calls onClose(), backing out left
   * that tier behind. Every one was named "Standard" (blankTier defaults to
   * indexHint 1), so cancelling three times produced three identical rows.
   * Reported 2026-08-09 as "opening/closing the modal creates a new tier".
   *
   * onDraftCommit is now the only thing that writes `tiers`.
   */
  const [pendingNewTier, setPendingNewTier] = useState<DraftTier | null>(null);

  const addAndEditTier = () => {
    // indexHint from the current count, so the second tier is "Tier 2" rather
    // than a second "Standard".
    const nt = blankTier({ currency, indexHint: tiers.filter(t => !t.deleted).length + 1 });
    setPendingNewTier(nt);
    openTierEditor(nt.localId);
  };

  /** Shared by every path that closes the modal — commit or not. */
  const closeTierModal = () => {
    setShowTierModal(false);
    setPendingNewTier(null);
    setEditTierLocalId(undefined);
  };

  // Notify parent
  useEffect(() => {
    /*
     * `isPaid` and "should we send tiers" are two different questions. They
     * used to be one, and that silently threw away work.
     *
     * isPaid stays strictly PRICE-derived: it drives the Stripe gate and the
     * disabled state on Submit, so a free tier must never flip it true or a
     * seller with no Stripe account gets blocked from a free listing.
     *
     * What changed is the second question. The old rule emitted
     * `tiers: paid ? named : []`, so a FREE tier carrying a capacity and a
     * registration form emitted ZERO tiers and both were discarded — "free
     * product, 50 seats, with an application form" was configurable and
     * unsavable. A tier is now submitted when the seller actually configured
     * it: it charges, or it caps supply, or it asks questions, or they named
     * it something of their own. The untouched seed tier still emits nothing,
     * so a plain free product is unchanged.
     *
     * The backend already supports all of this — it accepts a zero-price tier,
     * requires no Stripe for one, persists capacity and the form, and enforces
     * stock inside the free-checkout transaction.
     */
    /* A parcel has no download channel — see the `tiers:` emit below. */
    const withoutDigitalDelivery = (t: DraftTier): DraftTier =>
      isPhysical ? { ...t, files: [], links: [] } : t;

    const named = tiers.filter(t => !t.deleted && t.name.trim());
    const paid = named.some(t => t.priceMode === "pwyw" || (!!t.price && parseFloat(t.price) > 0));
    const configured = named.filter(t =>
        (!!t.price && parseFloat(t.price) > 0)
        || t.priceMode === "pwyw"
        || !!t.capacity?.trim()
        || !!t.draftForm?.fields?.length
        // License terms / a download cap are real configuration too — without
        // this, setting only a license on the free default tier would drop the
        // tier at emit and lose the license (feat/…-license-surfacing).
        || !!t.licenseTerms?.trim()
        || !!t.maxDownloads?.trim()
        || !AUTO_SEED_NAME.test(t.name.trim()),
    );
    onChange?.({
      name, description, tags, categoryId, subCategoryId, mediaItems,
      /*
       * Product-level deliverables are retired: files, external links, and the
       * licence now live INSIDE each variant (VariantEditView → the DraftTier
       * files/links/licenseTerms). These two fields stay on ProductFormData for
       * type compatibility but the form no longer populates them — the per-tier
       * data travels on `tiers` below (File objects intact on tiers[i].files[j]).
       */
      productFiles: [],
      links: [],
      isPaid: paid,
      price: "",
      currency,
      isRecurring: false,
      recurringInterval, ctaText,
      /*
       * Derived from the picker, which is the source of truth for both axes.
       * The stored shape is an enum plus grant rows; deriving here rather than
       * tracking the enum separately is what stops the summary and the rows
       * disagreeing.
       */
      viewability: viewResolved.visibility,
      accessibility: buyResolved.visibility,
      viewTierIds: viewResolved.tierIds,
      buyTierIds: buyResolved.tierIds,
      requiresApproval,
      // Seeded from initialData, so an untouched edit re-emits the same value and
      // a create emits null (= platform default / Standard).
      refundPolicy,
      // Spread, not a key: an untouched switch must not put the field in the
      // payload at all, or the backend records an answer nobody gave. A course
      // (hideRepeatPurchase) always stamps false — it is bought once, and the
      // toggle is hidden, so the value must not depend on a stale draft.
      ...(hideRepeatPurchase
        ? { allowRepeatPurchase: false }
        : allowRepeatPurchase === undefined
          ? {}
          : { allowRepeatPurchase }),
      /*
       * NULLED for anything that is not physical, and this is the guard, not a
       * tidy-up. normalisePhysicalFields THROWS a ValidationError when a
       * digital product arrives carrying `condition` or `parcelClass` — it
       * refuses to silently drop them, because dropping quietly is how a caller
       * ships believing it set something. So the form must not emit them.
       *
       * Doing it HERE rather than at each consumer's submit is the same
       * argument the normaliser itself makes: two consumers remembering the
       * same rule is one consumer eventually forgetting it. Whatever this form
       * emits is safe to append as-is.
       */
      condition: isPhysical ? condition : null,
      parcelClass: isPhysical ? parcelClass : null,
      /*
       * Every configured tier, free or paid — not only the paid ones.
       *
       * `withoutDigitalDelivery` when the product is physical: the deliverables
       * that used to hang off the product now hang off each VARIANT, and the
       * rule that protected them has to move with them.
       *
       * The rule: files and external links are DELIVERY, not description. They
       * land in a private bucket and are handed to the buyer on purchase. A
       * seller who fills in a variant while the listing is Digital, then steps
       * back and switches it to Physical, can no longer see those rows — the
       * variant editor renders the physical shape core instead. Emitting them
       * anyway ships the parcel buyer a download the seller believes they
       * removed, with nothing on screen having said so.
       *
       * Emptied on EMIT, not cleared from state, exactly as the product-level
       * rule did: switch back to Digital and the deliverables are still there.
       */
      tiers: configured.length > 0 ? named.map(withoutDigitalDelivery) : [],
      donation,
    });
  }, [name, description, tags, categoryId, subCategoryId, mediaItems, currency, recurringInterval, ctaText, viewAccess, buyAccess, requiresApproval, refundPolicy, allowRepeatPurchase, hideRepeatPurchase, tiers, donation, condition, parcelClass, isPhysical]); // eslint-disable-line react-hooks/exhaustive-deps

  // Configured tiers drive the Pricing row summary + tier cards. A blank
  // seed tier ("Standard") counts once the user has named it.
  const configuredTiers = tiers.filter(t => !t.deleted && t.name.trim());

  /*
   * Name length. The counter stays hidden until the last fifth of the budget,
   * so a seller typing a normal title never sees a number at all -- it appears
   * when it starts to matter, which is also the moment a paste blows past it.
   */
  const nameLeft = LISTING_NAME_MAX - name.trim().length;
  const nameTooLong = listingNameTooLong(name);

  // Which page's blocks to render. Default "all" → all true → byte-identical to
  // before, so the drawer and admin single-page form are unaffected. The wizard
  // splits the form across pages: "listing" (details), "commerce" (variants +
  // pricing + donations) and "settings" ("Policies & access" — approval +
  // repeat-purchase). Explicit membership rather than `!== x` so a new page can
  // never silently fall into a block it does not own.
  const showListing = page === "all" || page === "listing";
  const showCommerce = page === "all" || page === "commerce";
  const showSettings = page === "all" || page === "settings";

  return (
    <div className="space-y-6">
      {showListing && (<>
      {/* ─── Basics banner ─── purely decorative lead-in, no input of its
           own; sits above the name field it introduces. Copy swaps
           product/course via the same `productType` flag the rest of this
           form already keys off of (see `noun` above). */}
      {/* Pencil glyph — "naming/starting" the listing, not a generic
          decorative icon. Each banner's icon must read as the step it
          sits above (basics vs pricing), never interchangeable. */}
      <WizardStepBanner
        icon={<PenLine className="h-[18px] w-[18px]" />}
        title={basicsBannerTitle}
        subtitle={basicsBannerSubtitle}
      />

      {/* ─── Product name — big inline title (borderless, matches event) ─── */}
      <div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={L.namePlaceholder}
          aria-invalid={nameTooLong || undefined}
          className="w-full text-[28px] font-bold text-zinc-900 placeholder:text-zinc-300 bg-transparent border-none outline-none p-0 leading-tight" />
        {/* Soft, rounded error treatment matching the form's language
            elsewhere (rounded pills/badges, muted tints) instead of a
            sharp-cornered box or a plain triangle-and-text row. Icon +
            message together, never color alone. Validation logic
            unchanged — still only shows when showErrors && no name. */}
        {showErrors && !name.trim() && (
          <p className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-amber-50 px-3 py-1.5 text-[13px] text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Give your product a name so people know what they&apos;re looking at
          </p>
        )}
        {/*
          * Silent until it is nearly relevant, then a countdown, then a plain
          * statement of how much has to go. Absent entirely for the ordinary
          * short title, which is almost every title.
          */}
        {nameLeft <= NAME_COUNTER_FROM && (
          <p className={`mt-2 text-[13px] tabular-nums ${nameTooLong ? "text-red-600 font-medium" : "text-zinc-400"}`}>
            {nameTooLong
              ? `${-nameLeft} too many. A name this long is a description, not a title.`
              : `${nameLeft} left`}
          </p>
        )}
      </div>

      {/* ─── Photos ─── inline uploader. Tap the cover or any slot → the
           device's own photo picker → the square cropper (the ONLY popup) →
           the photo lands here. Cover (photo 1) is a capped 1:1 square that
           matches the crop + the marketplace card. Tap a thumbnail to make it
           the cover; tap the corner X to remove. Fully responsive: the cover
           is full-width up to 360px, thumbnails wrap. No gallery popup. */}
      <div>
        {mediaItems[0] ? (
          <div className="group relative w-full max-w-[360px] aspect-square rounded-2xl overflow-hidden ring-1 ring-zinc-100">
            <button type="button" onClick={() => recropPhoto(0)} className="block w-full h-full cursor-pointer" aria-label="Recrop cover photo">
              <img src={mediaSrc(mediaItems[0])} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-wide bg-white/85 backdrop-blur-sm text-zinc-800 px-2.5 py-1 rounded-full">Cover</span>
              <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/25 text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <ImageIcon className="h-[18px] w-[18px]" /> Recrop
              </span>
            </button>
            <button type="button" onClick={() => removePhoto(0)} aria-label="Remove cover photo"
              className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={pickPhoto}
            className="group relative w-full max-w-[360px] aspect-square rounded-2xl bg-zinc-50 border-2 border-dashed border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2.5 text-zinc-400 hover:text-zinc-500">
            <span className="w-12 h-12 rounded-2xl bg-white ring-1 ring-zinc-100 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <ImageIcon className="h-6 w-6 text-zinc-300" />
            </span>
            <span className="text-[13px] font-medium">Add cover photo</span>
            <span className="text-[11px] text-zinc-300">Up to 5 · the first is your cover</span>
          </button>
        )}

        {/* Thumbnails (photos 2-5) — filled tiles or ghost add-slots. */}
        <div className="flex flex-wrap gap-2.5 mt-2.5">
          {[1, 2, 3, 4].map((i) => {
            const m = mediaItems[i];
            return m ? (
              <div key={m.id ?? i} className="group relative w-16 h-16 rounded-xl overflow-hidden ring-1 ring-zinc-100">
                <button type="button" onClick={() => makeCover(i)} title="Make cover" aria-label="Make this the cover"
                  className="block w-full h-full cursor-pointer transition-transform duration-150 hover:scale-[1.04]">
                  <img src={mediaSrc(m)} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 text-[9px] font-semibold text-white text-center py-0.5 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">Make cover</span>
                </button>
                <button type="button" onClick={() => removePhoto(i)} aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/70 hover:bg-black/85 text-white flex items-center justify-center transition-colors cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button type="button" key={`add-${i}`} onClick={pickPhoto} aria-label="Add photo"
                className="w-16 h-16 rounded-xl flex items-center justify-center text-zinc-300 border-2 border-dashed border-zinc-200 transition-all duration-150 hover:text-zinc-500 hover:border-zinc-300 hover:-translate-y-0.5 hover:scale-[1.04] cursor-pointer">
                <Plus className="h-5 w-5" />
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-zinc-400 mt-2.5">{mediaItems.length > 0 ? `${mediaItems.length} of 5 photos · tap a photo to make it the cover` : "Up to 5 photos · the first is your cover"}</p>
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />
      </div>
      </>)}

      {/* ─── Detail rows — done-states (check + snippet when filled) + hover
           motion. Split into a LISTING group (description · tags · category ·
           CTA) and a COMMERCE group (postage · stock · files · links) so the
           create wizard can show each on its own step via `page`; "all" renders
           both, listing first. ─── */}
      {showListing && (
      <div className="space-y-2.5">
        <button type="button" onClick={() => setIsDescriptionOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {descriptionPreview ? (
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-4 w-4" strokeWidth={3.5} /></span>
          ) : (
            // Colored badge, not a flat icon — distinct accent per row type
            // so the list reads as several kinds of thing, not one repeated
            // glyph (feat/wizard-presets-and-banners).
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-amber-100 text-amber-600 shrink-0"><FileText className="h-4 w-4" /></span>
          )}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${descriptionPreview ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{descriptionPreview ? "Description" : "Add description"}</span>
            {/* Subtitle in BOTH states — L.descriptionHint explains what the
                field is for when unanswered, so an empty row isn't bare. */}
            <span className={`block text-[12.5px] truncate ${descriptionPreview ? "text-zinc-500" : "text-zinc-400"}`}>
              {descriptionPreview || L.descriptionHint}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>

        {/* Category above tags: categories take priority (a product's single
            primary classification) over tags (secondary, free-form, many
            per product) -- swapped from the original description/tags/
            category order per the user's explicit call. */}
        <CategoryPickerRow
          categories={categories ?? []}
          categoryId={categoryId}
          subCategoryId={subCategoryId}
          noun="product"
          onChange={({ categoryId: c, subCategoryId: sc }) => {
            setCategoryId(c);
            setSubCategoryId(sc);
          }}
        />

        <button type="button" onClick={() => setIsTagsOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {tags.length > 0 ? (
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-4 w-4" strokeWidth={3.5} /></span>
          ) : (
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-purple-100 text-purple-600 shrink-0"><TagIcon className="h-4 w-4" /></span>
          )}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${tags.length > 0 ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{tags.length > 0 ? "Tags" : "Add tags"}</span>
            <span className={`block text-[12.5px] truncate ${tags.length > 0 ? "text-zinc-500" : "text-zinc-400"}`}>
              {tags.length > 0 ? tags.map(t => t.name).join(" · ") : L.tagsHint}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>

        <button type="button" onClick={() => setIsCtaOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
          {ctaText.trim() ? (
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-4 w-4" strokeWidth={3.5} /></span>
          ) : (
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-blue-100 text-blue-600 shrink-0"><MousePointerClick className="h-4 w-4" /></span>
          )}
          <span className="flex-1 min-w-0">
            <span className={`block text-sm truncate ${ctaText.trim() ? "font-medium text-zinc-800" : "text-zinc-500"}`}>Call to Action Label<span className="font-normal text-zinc-400 text-[12.5px]">{ctaText.trim() ? "" : " · optional"}</span></span>
            {/* L.ctaHint is long — truncate rather than shorten, matching how
                the answered-state summary line already truncates. */}
            <span className={`block text-[12.5px] truncate ${ctaText.trim() ? "text-zinc-500" : "text-zinc-400"}`}>
              {ctaText.trim() ? `“${ctaText}”` : L.ctaHint}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>
      </div>
      )}

      {showCommerce && (
      <div className="space-y-2.5">
        {/* Condition, parcel size and stock used to render here for the
            single-variant case. They are per-VARIANT facts and the variant
            editor owns all three - see the note beside `condition` above. */}
        {/* Files, external links, and the licence that governs them are no
            longer product-level rows: every deliverable now lives INSIDE its
            variant (VariantEditView's Files / External links / Licence
            sections), reached by tapping a tier in the Pricing card below. */}
      </div>
      )}

      {/* ─── Product Options ─── one card, hairline-divided rows (mirrors the
           event "Event Options" card). Pricing is the first row and opens the
           SAME tier wizard events use. Visibility rows drop when
           `hideVisibility`; the approval row drops when `hideApproval`. */}
      {/* The "Product Options" eyebrow was removed 2026-08-09 — the rows say
          what they are, and the label was the only thing separating this card
          from the detail rows above it. */}
      {(showCommerce || showSettings) && (showTiers || !hideVisibility || !hideApproval || !hideRepeatPurchase) && (
        <div className="space-y-6">
          {/*
            * ── Variants ──
            *
            * The old in-card "Variants" title + subtext and the enclosing
            * wrapper card are GONE (feat/wizard-presets-and-banners). The
            * step this renders inside already carries its own title/subtitle
            * above the stepper (per the product spec), so a second "Variants"
            * header here was a redundant restatement, not new information.
            * The wrapper card is gone too — each tier keeps only its OWN
            * card, so a one-variant product (the common case) no longer
            * shows a card inside a card. "Add variant" moves to sit directly
            * below the last tier card, unwrapped, losing its dashed-border
            * treatment (that border read as "the edge of the variants panel",
            * which no longer exists) but keeping the dashed OUTLINE on the
            * button itself so it still reads as "add", not as a fourth tier.
            */}
          {showCommerce && showTiers && (
            <div className="space-y-3">
              {/* ── Pricing banner + quick-setup presets ──
                  Sits below the step's own title and above the tier cards.
                  The three cards write the SAME state the tier editor and
                  the donations field do (see the preset helpers above) —
                  there is no separate "preset" value stored anywhere. */}
              <WizardStepBanner
                icon={<Wallet className="h-[18px] w-[18px]" />}
                title={pricingBannerTitle}
                subtitle={pricingBannerSubtitle}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
                {([
                  {
                    kind: "free" as const, label: "Free", icon: Gift,
                    desc: `No payment required to get it.`,
                    cardSelected: "cursor-pointer border-emerald-300 bg-emerald-50",
                    badgeSelected: "bg-emerald-100 text-emerald-600",
                  },
                  {
                    kind: "paid" as const, label: "Paid", icon: Wallet,
                    desc: `Buyers pay to get access.`,
                    cardSelected: "cursor-pointer border-blue-300 bg-blue-50",
                    badgeSelected: "bg-blue-100 text-blue-600",
                  },
                  {
                    kind: "donations" as const, label: "Free with donations", icon: CreditCard,
                    desc: `Free, with an optional tip at checkout.`,
                    cardSelected: "cursor-pointer border-violet-300 bg-violet-50",
                    badgeSelected: "bg-violet-100 text-violet-600",
                  },
                  // Explicit per-card classnames, not an interpolated
                  // `border-${accent}-300` string: Tailwind only generates
                  // the classes it can see literally in source, so a
                  // template-built class name would be silently absent from
                  // the built CSS.
                ]).map(({ kind, label, icon: PresetIcon, desc, cardSelected, badgeSelected }) => {
                  const selected = activePricingPreset === kind;
                  // "Paid" AND "Free with donations" both need a connected
                  // Stripe account — a donation is charged through the same
                  // Connect account a priced tier is. The card itself stays a
                  // real click target either way (feedback: a dead disabled
                  // card with nothing to click was a worse experience than
                  // one that guides the seller to connect Stripe). Only the
                  // VISUAL treatment is muted/locked.
                  const needsStripe = (kind === "paid" || kind === "donations") && !stripeStatus.connected;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-label={label}
                      onClick={() => {
                        if (needsStripe) {
                          // Redirecting straight to Stripe with no warning is
                          // a jarring pattern interrupt (feedback) — confirm
                          // first instead of leaving immediately.
                          if (stripeStatus.connectUrl) setConfirmingStripeLeave(true);
                          return;
                        }
                        tapPricingPreset(kind);
                      }}
                      aria-pressed={selected}
                      className={cn(
                        "group h-full flex flex-col items-start text-left rounded-xl border px-3.5 py-3 transition-all duration-150 cursor-pointer",
                        needsStripe
                          ? "border-zinc-100 bg-zinc-50 hover:border-zinc-200"
                          : selected
                            ? cardSelected
                            : "border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50",
                      )}
                    >
                      {/* Bigger icon + badge — a real visual anchor for the
                          card, not a tiny decoration. Same fixed size and top
                          position on every card so the three stay aligned
                          regardless of label/description length. */}
                      <span className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full mb-2 shrink-0",
                        needsStripe ? "bg-zinc-200 text-zinc-400" : selected ? badgeSelected : "bg-zinc-100 text-zinc-500",
                      )}>
                        <PresetIcon className="h-5 w-5" />
                      </span>
                      <p className={cn("text-[13px] font-semibold", needsStripe ? "text-zinc-500" : "text-zinc-800")}>{label}</p>
                      <p className={cn("text-[11.5px] mt-0.5 leading-snug", needsStripe ? "text-zinc-400" : "text-zinc-500")}>
                        {needsStripe ? "Connect Stripe to sell for a price." : desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {configuredTiers.length > 0 && (
                <div className="space-y-2">
                  {configuredTiers.map((t, i) => (
                    /* The whole row opens the tier editor. The publish switch
                       that used to sit here is gone — publishing a tier lives
                       inside that editor's Availability section, so a second
                       copy here was one control writing another's value. */
                    /* An expanded, clickable card: the whole row opens the tier
                       editor, with a chevron as the drill-in cue. Name + price on
                       top, then a fact strip that surfaces capacity / files /
                       licence / stock so sellers see what lives inside and that
                       the row is editable. The strip wraps responsively and
                       renders only set facts. */
                    <button key={i} type="button" onClick={() => openTierEditor(t.localId)}
                      className="group w-full text-left rounded-xl bg-white border border-zinc-100 hover:bg-zinc-50 hover:border-zinc-200 transition-all duration-150 cursor-pointer overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200 text-zinc-600">
                          <Layers className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-zinc-800 truncate">{t.name.trim() || "Unnamed variant"}</p>
                          <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{variantPriceLabel(t)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                      </div>
                      <div className="flex flex-wrap border-t border-zinc-100">
                        {variantFacts(t, isPhysical).map((f) => (
                          <div key={f.k} className="flex-1 min-w-[110px] px-4 py-2.5 border-r border-zinc-100 last:border-r-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{f.k}</p>
                            <p className="text-[13px] font-medium text-zinc-800 mt-0.5 tabular-nums">{f.v}</p>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={addAndEditTier}
                onMouseEnter={e => { const b = "var(--brand-color, #b8336a)"; e.currentTarget.style.color = b; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand-color, #b8336a) 35%, transparent)"; e.currentTarget.style.background = "color-mix(in srgb, var(--brand-color, #b8336a) 6%, transparent)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = ""; e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium text-zinc-500 border border-dashed border-zinc-200 rounded-xl cursor-pointer transition-all duration-150">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add variant
              </button>
            </div>
          )}

          {/* ─── Donations ─── listing-level; opens a modal (desktop) / drawer
              (mobile). Commerce page, beside variants & pricing. */}
          {showCommerce && (
            <DonationsField
              donation={donation}
              onUpdate={(patch) => {
                setDonation((d) => ({ ...d, ...patch }));
                // Manual edit via the donations field — same dirty rule as
                // the tier editor above.
                setPricingDirty(true);
              }}
              defaultCurrency={currency}
              /*
               * Same Stripe gate as the "Free with donations" preset card
               * above, applied here too: a seller can also reach donations
               * directly (the row's own switch / Edit), bypassing the preset
               * tiles entirely. Blocks the save, not just the visual —
               * DonationsField refuses every patch (enabling, amounts, goal)
               * while disconnected, rather than decorating a control that
               * still writes.
               */
              stripeConnected={stripeStatus.connected}
              onNeedsStripe={() => {
                if (stripeStatus.connectUrl) setConfirmingStripeLeave(true);
              }}
            />
          )}

          {/* ── Pricing tip ── very bottom of the step, below Donations (not
              between "Add variant" and Donations as before), dismissible.
              "Variants, files, licence or stock" names what THIS wizard's
              pricing step can actually configure later — not events' "ticket
              types / capacity / sign-up form" wording, which doesn't
              describe a product or course. */}
          {showCommerce && showTiers && !pricingTipDismissed && (
            <DismissibleTipBanner
              body="You can always add more variants, upload files, set a licence or track stock for each one later."
              onDismiss={() => setPricingTipDismissed(true)}
            />
          )}

          {/* ─── Policies & access banner ─── purely decorative lead-in,
              same pattern as the basics/pricing banners, sitting above this
              step's first row. Shield glyph for "policies & access" — distinct
              from PenLine (basics) and Wallet (pricing), so each banner's
              icon reflects its OWN step rather than a shared decoration. */}
          {showSettings && (
            <WizardStepBanner
              icon={<Shield className="h-[18px] w-[18px]" />}
              title={settingsBannerTitle}
              subtitle={settingsBannerSubtitle}
            />
          )}

          {/* ─── Approval ───
              NOT community-scoped. requiresApproval is outside
              COMMUNITY_SCOPED_PRODUCT_FIELDS, so a member selling their own
              product may set it. Its own card, never the community one. */}
          {showSettings && !hideApproval && (
            <div>
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Approval</p>
              <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 divide-y divide-zinc-100 overflow-hidden">

              {/* Buyer applies, seller approves; the payment is held meanwhile.
                  Icon badge + title/subtitle + "Recommended for…" pill mirrors
                  the visual treatment this wizard's other banners/cards already
                  use (WizardStepBanner's tinted icon circle, the pricing preset
                  cards' badges) — this was the one toggle row still a bare
                  label+switch with no visual anchor. ShieldCheck (not the
                  Shield used by the step banner above) so the row reads as
                  "approval granted/verified" rather than reusing the step's own
                  glyph. The pill is static copy, not conditional on current
                  state — it's a recommendation about WHEN to turn this on, not
                  a description of the current setting (that's the subtitle's
                  job), so it shows regardless of whether approval is currently
                  required. */}
              <div
                onClick={() => setRequiresApproval(!requiresApproval)}
                className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-100/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 shrink-0">
                    <ShieldCheck className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800">Require approval</span>
                    {/*
                      * What is true RIGHT NOW, not what the feature is.
                      *
                      * This described the switch in both positions, which the
                      * switch's own label already does -- so reading it told
                      * you nothing about which way it was set. The held
                      * payment is the part worth keeping, and it only applies
                      * when approval is ON, so it is said there and nowhere
                      * else.
                      */}
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {requiresApproval
                        ? "Buyers apply and you approve. Their payment is held until you decide."
                        : "Anyone can buy straight away"}
                    </p>
                    <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full bg-zinc-100 text-[10px] font-medium text-zinc-500">
                      Recommended for private {noun}s
                    </span>
                  </div>
                </div>
                <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} onClick={e => e.stopPropagation()} />
              </div>
              </div>
            </div>
          )}

          {/* ─── Purchases ───
              Its own card rather than a second row under Approval: approval is
              about who may buy, this is about what an owner is shown after
              they already have. Hidden for a course (`hideRepeatPurchase`),
              which is always bought once; gated on `showSettings` so it rides
              the "Policies & access" step with Approval, not commerce. */}
          {showSettings && !hideRepeatPurchase && (
          <div>
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Purchases</p>
            <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 divide-y divide-zinc-100 overflow-hidden">
              <div
                onClick={() => setAllowRepeatPurchase(!repeatShown)}
                className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-100/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Was a bare icon, no badge at all — the one row on this
                      step with no colored anchor, matching feedback. */}
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-cyan-100 text-cyan-600 shrink-0">
                    <Repeat className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800">Can be bought more than once</span>
                    {/*
                      * The longest line on the step, replaced by the outcome.
                      *
                      * It ran to two wrapped lines and spent them teaching the
                      * setting from both sides at once -- "On for anything
                      * delivered per purchase ... Off for a download or a
                      * course ...". A reader who has already set the switch is
                      * being told about the position they did not pick, and
                      * the cap that stopped it crowding the toggle was there
                      * because the text was too long for the row at all.
                      *
                      * Each position now says what happens in it, which is
                      * also short enough that the measure cap is no longer
                      * doing anything.
                      */}
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {repeatShown
                        ? "Buyers can buy it again, like a session or a consultation."
                        : "Owners are sent to what they already bought."}
                    </p>
                  </div>
                </div>
                <Switch checked={repeatShown} onCheckedChange={setAllowRepeatPurchase} onClick={e => e.stopPropagation()} />
              </div>
            </div>
          </div>
          )}

          {/* ─── Refunds ─── the seller's own policy (like approval), the SAME
              control the manage page's refund modal uses (RefundPolicyField).
              Standard = platform default window; None = buyers contact the seller.
              Always on the settings page for every sellable artifact. */}
          {showSettings && (
          <div>
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Refunds</p>
            <RefundPolicyField value={refundPolicy} onChange={setRefundPolicy} anchor="PURCHASE" />
          </div>
          )}

          {/* ─── Community access ───
              Visibility and Purchase exist ONLY because a community owns this
              product: the backend refuses both on a personal one
              (COMMUNITY_SCOPED_PRODUCT_FIELDS, 403). They used to sit in the
              card above and simply vanish for a member seller, which read as
              two missing features rather than one rule.

              No eyebrow on the Pricing card above: that label was removed
              deliberately on 2026-08-09 because it was the only thing
              separating the card from the detail rows. These two are new
              groups, and the label IS the explanation. */}
          {showCommerce && !hideVisibility && (
            <div>
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Community access</p>
              <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 divide-y divide-zinc-100 overflow-hidden">

                {/* Who can SEE it. Public and All members are shortcuts that
                    imply every membership tier below them, so picking either
                    ticks and freezes the rows - "frozen" there means already
                    included, unlike the card-level rule where a capability you
                    cannot have is not rendered at all. */}
                <div className="px-5 py-4">
                  {/* Same signals as the event form's policy rows: the glyph
                      says what the control governs, a lock appears on it once
                      the thing stops being public, and the meter says how much
                      of the audience is included.

                      The glyph no longer flips between Eye and EyeOff. That
                      pair is binary, so it said "public or not" and nothing
                      about how far from public -- and it left the row with no
                      stable symbol of its own, which is what made this header
                      and the "Who can buy it" one below it hard to tell apart
                      at a glance. */}
                  <div className="flex items-center gap-3 mb-3 min-w-0">
                    <PolicyIcon
                      icon={<Eye className="h-[18px] w-[18px] text-zinc-400 shrink-0" />}
                      level={tierAccessLevel(viewAccess)}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-800">Who can see it</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{tierAccessSummary(viewAccess, membershipTiers)}</p>
                    </div>
                    <AudienceMeter level={tierAccessLevel(viewAccess)} />
                  </div>
                  <MembershipTierPicker
                    value={viewAccess}
                    onChange={changeViewAccess}
                    tiers={membershipTiers}
                    publicLabel="Anyone, including people who are not members"
                  />
                </div>

                {/* Who can BUY. Separate axis on purpose: showing a product to
                    every member while selling it to one tier is the case the
                    feature exists for. */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3 min-w-0">
                    <PolicyIcon
                      icon={<UserCheck className="h-[18px] w-[18px] text-zinc-400 shrink-0" />}
                      level={tierAccessLevel(buyAccess)}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-800">Who can buy it</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{tierAccessSummary(buyAccess, membershipTiers)}</p>
                    </div>
                    <AudienceMeter level={tierAccessLevel(buyAccess)} />
                  </div>
                  <MembershipTierPicker
                    value={buyAccess}
                    onChange={setBuyAccess}
                    tiers={membershipTiers}
                    publicLabel="Anyone can buy it, members or not"
                    ceiling={buyCeiling}
                  />
                </div>
              </div>
              {/* The two questions read back as ONE rule. The card asks them in
                  two groups and never stated the combined result, which is
                  exactly where "visible to Founding, buyable by anyone" hid.
                  Null for a fully public product - that needs no narrating. */}
              {tierAccessConsequence(viewAccess, buyAccess, membershipTiers) && (
                <p className="text-[11px] text-zinc-500 mt-2 px-1 leading-relaxed">
                  {tierAccessConsequence(viewAccess, buyAccess, membershipTiers)}
                </p>
              )}
              <p className="text-[11px] text-zinc-400 mt-2 px-1">
                Available because this community owns this product.
              </p>
            </div>
          )}

        </div>
      )}


      {/* ─── Description Editor Dialog ─── */}
      <Dialog open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
        {/* Fixed height (not just a max-height cap): this dialog holds only the
            description editor, and now that MarkdownEditor's own textarea caps
            its growth and scrolls internally past ~200px, nothing left inside
            this dialog still changes size as you type -- h-[520px] keeps the
            dialog itself from visibly resizing too, on top of that. max-h-[85vh]
            stays as the safety cap for short/mobile viewports. */}
        <DialogContent className="sm:max-w-3xl h-[520px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{L.descriptionTitle}</DialogTitle>
            <DialogDescription>{L.descriptionHint}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MarkdownEditor value={description} onChange={setDescription} placeholder={L.descriptionPlaceholder} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDescriptionOpen(false)}>Cancel</Button>
            <Button onClick={() => setIsDescriptionOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Postage & condition are inline now (see the commerce group above), so
          there is no dialog here. */}

      {/* ─── Tags Modal ─── (matches the event Tags tap-row → modal) */}
      <Dialog open={isTagsOpen} onOpenChange={setIsTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{L.tagsTitle}</DialogTitle>
            <DialogDescription>{L.tagsHint}</DialogDescription>
          </DialogHeader>
          <EventTags selectedTags={tags} onTagsChange={setTags} placeholder="Search or create tags..." />
          <DialogFooter>
            <Button onClick={() => setIsTagsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Crop popup ─── the ONLY photo popup. The device picker feeds it
           an image (directCropSrc); the user frames it to a 1:1 square and it
           lands in the carousel. No gallery popup in between. */}
      <BannerCropModal
        open={cropOpen}
        onOpenChange={setCropOpen}
        directCropSrc={cropSrc}
        onSave={onCropSave}
        title="Frame your photo"
        hideStockPhotos
      />

      {/* Files / Link-deliverables / License modals removed — deliverables are
          per-variant now and edited inside VariantEditView (opened from the
          Pricing card's tier rows). */}

      {/* ─── Call to Action Label Modal ─── (CTA text) */}
      <Dialog open={isCtaOpen} onOpenChange={setIsCtaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Call to Action Label</DialogTitle>
            <DialogDescription>{L.ctaHint}</DialogDescription>
          </DialogHeader>
          <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="Buy Now" maxLength={15} />
          <DialogFooter>
            <Button onClick={() => setIsCtaOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tier wizard (draftMode) ─── the same PriceEditModal events use,
          seeded from this form's own draft state. draftMode → no backend
          WRITES; on Save it hands the drafts back via onDraftCommit and the
          parent POSTs them as part of the create-product payload. When
          showMemberPricing is on (community-owned), the modal reads community
          segments and folds per-tier member pricing into the create payload
          too. Per-tier registration forms ride the payload the same way. */}
      {showTierModal && (
        <ProductManagementConfigProvider value={DRAFT_CONFIG_STUB}>
          <PriceEditModal
            product={{ price: 0, currency, isRecurring, recurringInterval }}
            communityTag={communityTag}
            productId=""
            draftMode
            initialDraftTiers={pendingNewTier ? [...tiers, pendingNewTier] : tiers}
            initialDraftDonation={donation}
            productType={productType}
            openTierLocalId={editTierLocalId}
            onDraftCommit={({ tiers: nextTiers, donation: nextDonation }) => {
              setTiers(nextTiers);
              setDonation(nextDonation);
              // Manual edit via the tier editor — the next preset tap must
              // confirm before it overwrites this.
              setPricingDirty(true);
            }}
            onClose={closeTierModal}
            onSaved={closeTierModal}
            /*
             * Deliberate no-op: ProductForm has no toast host of its own, and
             * inventing one here would collide with whatever the consuming app
             * already renders. Safe only because PriceEditModal surfaces its
             * own failures inline (see saveError there) — until 2026-08-08 it
             * did not, and this stub silently swallowed "Price required",
             * which is what made Save look dead. If a consumer wants toasts,
             * the fix is to thread its own through, not to fill this in.
             */
            showToast={() => {}}
            showMemberPricing={showMemberPricing}
          />
        </ProductManagementConfigProvider>
      )}

      {/* ─── Pricing-preset discard guard ───
          Only raised when the seller manually configured something a preset
          tap would overwrite (pricingDirty) and the tapped preset is not
          already the active one — see tapPricingPreset above. */}
      <DiscardPrompt
        open={pendingPreset !== null}
        onCancel={() => setPendingPreset(null)}
        onConfirm={() => {
          if (pendingPreset) applyPricingPreset(pendingPreset);
          setPendingPreset(null);
        }}
        title="Replace your pricing setup?"
        message="Switching to this preset will overwrite the price and donation settings you configured manually."
        confirmLabel="Use preset"
        cancelLabel="Keep my setup"
      />

      <ConfirmLeaveModal
        open={confirmingStripeLeave}
        onCancel={() => setConfirmingStripeLeave(false)}
        onConfirm={() => {
          setConfirmingStripeLeave(false);
          if (stripeStatus.connectUrl) window.location.href = stripeStatus.connectUrl;
        }}
        title="Connect Stripe to accept payments"
        message="You'll be taken to Stripe to connect your account. You can come back and finish this listing afterward."
        confirmLabel="Continue to Stripe"
        cancelLabel="Not now"
      />
    </div>
  );
}
