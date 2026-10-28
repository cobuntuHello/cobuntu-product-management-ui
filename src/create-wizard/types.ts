import type * as React from "react";
import type { CreateOutcome, MemberFeeModel, SubmitAction } from "@cobuntu/management-ui-shared";
import type { CategoryOption } from "../components/CategoryPickerRow";
import type { ProductCreateType } from "../lib/productCreatePayload";
import type { ProductCreateWizardCopy } from "./i18n";

/**
 * ProductCreateWizard's contract with its host.
 *
 * Mirrors @cobuntu/event-management-ui's EventCreateWizard: the wizard owns the
 * flow (steps, validation, the create request, drafts, gates) and the markup;
 * the host owns where the API is and how it authenticates (`transport`), where
 * links go (`navigation`), and the words (`copy`).
 *
 * `productType` is fixed per rendered wizard, not chosen inside it — the
 * community app renders one instance for /marketplace/new (DIGITAL/PHYSICAL)
 * and a second for /learning/new (COURSE). See resolveCreateSteps's
 * `withContentStep`, which this wizard sets from `productType === "COURSE"`.
 */

/** An unfinished wizard, as the "Continue where you left off" step lists it. */
export interface ProductDraftSummary {
  id: string;
  kind: "product";
  name: string | null;
  /** Where they stopped. Null for drafts written before the pointer existed. */
  draftStep: string | null;
  /** ISO timestamp. */
  updatedAt: string;
  /** Set when the draft is being built for the community rather than the person. */
  communityId: string | null;
}

/** A stored draft row. Everything is optional by design: resume fails soft. */
export interface ProductDraftRow {
  id?: string;
  communityId?: string | null;
  draftStep?: string | null;
  [key: string]: unknown;
}

/** What autosave writes: the fields worth keeping between keystrokes. */
export type ProductDraftSnapshot = Record<string, unknown>;

/** A fee package (arrangement) the member may list under. `rate` is 0..1. */
export interface ProductFeePackage {
  id: string;
  name: string;
  description: string | null;
  rate: number;
}

export interface MemberStripeStatus {
  connected: boolean;
  chargesEnabled: boolean;
}

export interface ProductWizardPermissions {
  /** MARKETPLACE_CREATE in this community: may create on the community's behalf. */
  marketplaceCreate: boolean;
}

export interface ProductWizardTier {
  id: string;
  name: string;
}

/** The answer to a draft save. A 409 means the row is no longer a draft. */
export type SaveDraftResult = { ok: true } | { ok: false; status: number };

/** The create call's answer. Transport hides the upload-job poll. */
export type CreateProductResult =
  | { ok: true; productId: string }
  | {
      ok: false;
      status?: number;
      /** Machine code from the API, e.g. "STRIPE_REQUIRED". */
      code?: string;
      /** Human message from the API (`error` or `message`). */
      message?: string;
    };

/**
 * Every network call the wizard makes, as async functions.
 *
 * Bound to the community and the signed-in member by the host; none of them
 * takes a community tag. Modeled closely on what the community app's
 * CreateProductClient.tsx calls today (marketplace/new), generalized to
 * explicit params.
 */
export interface ProductCreateWizardTransport {
  /** The member's unfinished drafts of this productType in this community. */
  listDrafts(): Promise<ProductDraftSummary[]>;
  /** One draft, or null when it cannot be read (the wizard then opens empty). */
  getDraft(id: string): Promise<ProductDraftRow | null>;
  /**
   * Upsert the draft row `id` (the wizard mints it; it is the idempotency key).
   * `keepalive` is set for the flush on page hide.
   */
  saveDraft(id: string, snapshot: ProductDraftSnapshot, opts?: { keepalive?: boolean }): Promise<SaveDraftResult>;
  /** Delete a draft. Resolve when deleted or already gone (404); throw otherwise. */
  deleteDraft(id: string): Promise<void>;
  /** Fee packages for a personal listing of this productType. Empty when none. */
  myPackages(productType: ProductCreateType): Promise<ProductFeePackage[]>;
  /** The member's OWN Stripe (paid listings pay out to the member). */
  stripeStatus(): Promise<MemberStripeStatus>;
  /** Only called when the host does not pass `canCreateForCommunity`. */
  permissions(): Promise<ProductWizardPermissions>;
  /** Product categories of this community. Empty hides the picker. */
  categories(): Promise<CategoryOption[]>;
  /** Membership tiers (segments/public), for the access step and member pricing. */
  tiers(): Promise<ProductWizardTier[]>;
  /**
   * POST the create request and report the result.
   *
   * The wizard assembles `formData` via `buildProductCreateFormData` (this
   * package's existing shared payload builder) and hands it to the transport
   * unopened — the transport's job is only the network (including, where the
   * host's API is async, polling an upload job to completion), never the body.
   */
  createProduct(formData: FormData): Promise<CreateProductResult>;
}

/** Props a host's link component receives (see `navigation.renderLink`). */
export interface WizardLinkProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  "aria-label"?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export interface ProductCreateWizardHrefs {
  /** The marketplace/catalogue list: breadcrumb parent and default Cancel target. */
  marketplace: string;
  /** Where a member connects their own Stripe. */
  connectStripe: string;
  /** "How it works" (selling in this community). */
  howItWorks: string;
  /** The selling guide linked from the first-time explainer. */
  sellingGuide: string;
  /** "Read the full guide" in the first-time explainer. */
  fullGuide: string;
  /** A fresh create flow ("Create another product"). */
  createAnother: string;
  viewProduct: (idOrSlug: string) => string;
  manageProduct: (idOrSlug: string) => string;
  /** The listing review thread for a pending listing. */
  reviewListing: (idOrSlug: string) => string;
  /** The place a saved draft is found again (the app sends profile/catalogue). */
  drafts: string;
}

/** What onDone receives once the product exists. */
export interface ProductCreateWizardResult {
  product: { id: string; name: string };
  /** What happened to the listing: published, pending, unlisted, saved. */
  outcome: CreateOutcome;
  /** The button pressed. */
  action: SubmitAction["kind"];
  ownership: "community" | "personal";
  /** Answers to `extraSteps`, keyed by step id. Never sent to Cobuntu. */
  extraValues: Record<string, unknown>;
}

export interface ProductCreateWizardNavigation {
  hrefs: ProductCreateWizardHrefs;
  /** Follow an href (the host router). Default: window.location.assign. */
  navigate?: (href: string) => void;
  /** Render a link (e.g. next/link). Default: a plain <a>. */
  renderLink?: (props: WizardLinkProps) => React.ReactNode;
  /** Cancel on the first step. Default: navigate(hrefs.marketplace). */
  onCancel?: () => void;
  /** Called once the product is created, before the confirmation step shows. */
  onDone?: (result: ProductCreateWizardResult) => void;
  /**
   * Open a draft from the Continue step. The app navigates to its own
   * `?draft=` URL; omitted, the wizard resumes it in place.
   */
  onResumeDraft?: (draft: { id: string; draftStep: string | null }) => void;
  /**
   * Whether the breadcrumb's back arrow should pop browser history rather than
   * follow its href (the app: when there is in-app history to go back to).
   * Default: never.
   */
  shouldUseHistoryBack?: () => boolean;
}

/** A host-defined step appended after the last Cobuntu step, before submit. */
export interface ProductCreateWizardExtraStep<V = unknown> {
  /** Unique, and not one of the built-in step ids. */
  id: string;
  /** The name on the progress rail. */
  label: string;
  /** Page heading on this step. */
  title: string;
  subtitle?: string;
  render: (ctx: {
    value: V | undefined;
    onChange: (next: V) => void;
    /** True once the person tried to leave the step with it invalid. */
    showErrors: boolean;
    disabled: boolean;
  }) => React.ReactNode;
  /** Return an error message to block Next / submit, or null when valid. */
  validate?: (value: V | undefined) => string | null;
}

/**
 * Branding for a host that is not the community app. Each value becomes the
 * CSS variable the wizard already reads; anything omitted is inherited.
 * Setting a theme also brands the portalled modals (they mount inside the
 * wizard's themed wrapper instead of on document.body).
 */
export interface ProductCreateWizardTheme {
  textColor?: string;
  bgColor?: string;
  brandColor?: string;
  /** Text on brand-coloured fills. */
  brandContrast?: string;
  primaryButtonBg?: string;
  buttonRadius?: string;
  cardRadius?: string;
  headingFont?: string;
  bodyFont?: string;
}

export interface ProductCreateWizardCommunity {
  tag: string;
  id: string;
  name: string;
  iconUrl?: string | null;
  /** The community's payments capability; undefined when unknown (permissive). */
  payments?: { connected: boolean; chargesEnabled: boolean };
  /** What Cobuntu charges this community for this category (0..1). */
  platformFeeRate?: number;
  /** The member-listing fee model; null when member listing is off. */
  memberFeeModel: MemberFeeModel | null;
  /** Whether member submissions are reviewed before going live. */
  memberRequireApproval: boolean;
}

export interface ProductCreateWizardProps {
  community: ProductCreateWizardCommunity;
  /** The signed-in member, for the ownership card's avatar. */
  viewer?: { name?: string | null; profileImage?: string | null };
  transport: ProductCreateWizardTransport;
  navigation: ProductCreateWizardNavigation;
  copy?: ProductCreateWizardCopy;
  /**
   * Config for the few components inside this wizard (currently: the tags
   * autocomplete, `EventTags`) that call the Cobuntu API directly instead of
   * going through `transport` -- same contract `ProductManagementConfig`
   * (../config.tsx) documents: "each app has its own way of computing the
   * API base URL and the Authorization header". Omitted, both default to the
   * wizard's long-standing behavior (`apiBaseUrl: ""`, no auth header), which
   * only works for a host that happens to serve `/api/tags/*` itself on its
   * own origin -- every other host silently 404s. Pass these to fix that.
   */
  apiBaseUrl?: string;
  authHeaders?: () => Record<string, string>;
  extraSteps?: ProductCreateWizardExtraStep<any>[];
  theme?: ProductCreateWizardTheme;
  /**
   * Where portalled layers mount. "inline" (default) mounts them inside the
   * wizard root, so the scoped prebuilt stylesheet and a theme reach them;
   * "body" keeps document.body (the community app, whose modals stay light).
   */
  portal?: "inline" | "body";
  /**
   * EVENTS_CREATE's product equivalent (MARKETPLACE_CREATE), when the host
   * already knows it. Omitted, the wizard asks transport.permissions().
   */
  canCreateForCommunity?: boolean;
  /**
   * Unfinished drafts, when the host resolved them before render (the app does,
   * on the server, so the opening step is right on first paint). Omitted, the
   * wizard asks transport.listDrafts() and waits for the answer.
   */
  initialDrafts?: ProductDraftSummary[];
  /** The draft being continued (the app's ?draft=). */
  draftId?: string | null;
  /** Where they were when they last moved (the app's ?step=). */
  draftStepFromUrl?: string | null;
  /** Mirror the step onto ?step= while continuing a draft. Default true. */
  syncStepToUrl?: boolean;
  /**
   * What is being created. Fixed per rendered wizard — a host instantiates one
   * wizard for products (DIGITAL/PHYSICAL) and a separate one for courses
   * (COURSE), exactly like it renders two separate pages today. Default
   * "DIGITAL".
   */
  productType?: ProductCreateType;
  /**
   * The course's content/syllabus step, rendered between "commerce" and
   * "settings" (resolveCreateSteps's `withContentStep`) — same slot
   * EventCreateWizard reserves for `extraSteps`, but ahead of them, since a
   * course's syllabus is core to the flow rather than host-defined.
   *
   * Only meaningful when `productType === "COURSE"`; the step does not exist
   * without a renderer to fill it (a step whose answer is already known, or
   * whose body is empty, is not a step — see createWizard.ts). This package
   * ships no syllabus UI of its own: cobuntu-community-app's /learning/new
   * (CreateCourseClient.tsx) does not exist yet in this codebase to extract
   * from, so the course wizard's content step is left as a slot a course host
   * fills in, the same shape as `extraSteps`.
   */
  renderContentStep?: ProductCreateWizardExtraStep<any>["render"];
  /** Error for the content step, from the host's own validation. */
  validateContentStep?: (value: unknown) => string | null;
}
