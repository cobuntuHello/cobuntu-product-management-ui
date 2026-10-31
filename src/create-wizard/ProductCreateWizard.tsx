"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import {
  resolveSubmitActions,
  type SubmitAction,
  resolveCreateSteps, isFinalStep, nextStep, previousStep, clampStep, stepHeaderKeys, resumeStep,
  type CreateStepId,
  CreateStepRail, StepPane, WizardButton,
  CreatedModal,
  resolveCreateOutcome, type CreateOutcome,
  ListingAccessStep,
  fromTierAccessValue, PackagePicker, type TierAccessValue,
  PortalContainerProvider,
} from "@cobuntu/management-ui-shared";
import { ProductForm, type ProductFormData } from "../components/ProductForm";
import { ProductManagementConfigProvider } from "../config";
import { buildProductCreateFormData } from "../lib/productCreatePayload";
import { WizardCopyProvider, useWizardT } from "./i18n";
import { WizardNavProvider, DefaultLink, browserNavigate } from "./navigation";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { productDraftToForm, draftOwnership } from "./draftResume";
import { communityCannotTakeCommission } from "./communityCommissionGate";
import { ResumeDraftStep } from "./ResumeDraftStep";
import { OwnershipToggle } from "./OwnershipToggle";
import { FirstTimeCreatorModal } from "./FirstTimeCreatorModal";
import { FormErrorBanner, FormNoticeBanner } from "./banners";
import { Breadcrumb, HowItWorksButton } from "./chrome";
import { THEME_ADAPTER_CSS, THEMED_PORTAL_CSS, THEMED_ROOT_CSS } from "./theme";
import type {
  ProductCreateWizardProps,
  ProductCreateWizardTheme,
  ProductDraftRow,
  ProductDraftSummary,
  ProductFeePackage,
  ProductWizardTier,
} from "./types";

/**
 * The member "sell a product" wizard, as a component any seller can render.
 *
 * Lifted from the community app's /marketplace/new (CreateProductClient.tsx)
 * with its markup and classes UNCHANGED, mirroring
 * @cobuntu/event-management-ui's EventCreateWizard: the network is
 * `transport`, links and navigation are `navigation`, words are `copy`.
 *
 * The flow, unchanged from CreateProductClient:
 *   - steps are DERIVED (resolveCreateSteps): a member gets details, pricing,
 *     policies and the arrangement; a leader (MARKETPLACE_CREATE) first
 *     chooses who sells it, and community ownership swaps the arrangement for
 *     access;
 *   - unfinished drafts are offered as a first step, autosave keeps the row
 *     current, and finishing one finishes THAT row rather than leaving an
 *     orphan;
 *   - the submit buttons come from resolveSubmitActions (the state the
 *     listing will LAND in, never the role), gated the same way the app does:
 *     Stripe readiness for a paid submission, and whether the community can
 *     collect its commission;
 *   - a course (`productType="COURSE"`) gets the same flow plus a content
 *     step, via `withContentStep` / `renderContentStep` — see types.ts.
 */
export function ProductCreateWizard(props: ProductCreateWizardProps) {
  const { transport, navigation, copy, theme, portal = "inline", productType = "DIGITAL" } = props;

  const [localResume, setLocalResume] = useState<{ id: string; step: string | null } | null>(null);
  const draftId = localResume?.id ?? props.draftId ?? null;
  const draftStepFromUrl = localResume ? localResume.step : props.draftStepFromUrl ?? null;

  // MARKETPLACE_CREATE: from the host when it knows, else asked once.
  const [askedPermission, setAskedPermission] = useState<boolean | undefined>(undefined);
  const knowsPermission = props.canCreateForCommunity !== undefined;
  useEffect(() => {
    if (knowsPermission) return;
    let cancelled = false;
    transport.permissions()
      .then((p) => { if (!cancelled) setAskedPermission(!!p?.marketplaceCreate); })
      .catch(() => { if (!cancelled) setAskedPermission(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowsPermission]);
  const isLeader = props.canCreateForCommunity ?? askedPermission ?? false;

  const knowsDrafts = props.initialDrafts !== undefined;
  const [listedDrafts, setListedDrafts] = useState<ProductDraftSummary[] | null>(null);
  useEffect(() => {
    if (knowsDrafts || draftId) return;
    let cancelled = false;
    transport.listDrafts()
      .then((list) => { if (!cancelled) setListedDrafts(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setListedDrafts([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowsDrafts, draftId]);
  const drafts = props.initialDrafts ?? listedDrafts;
  const ready = (draftId || drafts !== null) && (knowsPermission || askedPermission !== undefined);

  const nav = useMemo(() => ({
    renderLink: navigation.renderLink ?? ((p) => <DefaultLink {...p} />),
    navigate: navigation.navigate ?? browserNavigate,
  }), [navigation.renderLink, navigation.navigate]);

  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const themed = !!theme;

  const body = ready ? (
    <WizardInner
      {...props}
      key={localResume?.id ?? "props"}
      productType={productType}
      draftId={draftId}
      draftStepFromUrl={draftStepFromUrl}
      isLeader={isLeader}
      drafts={drafts ?? []}
      onLocalResume={(d) => setLocalResume({ id: d.id, step: d.draftStep })}
    />
  ) : null;

  return (
    <div className={themed ? "cbt-product-wizard cbt-product-wizard--themed" : "cbt-product-wizard"} style={themeVars(theme)}>
      {themed && <style dangerouslySetInnerHTML={{ __html: THEMED_ROOT_CSS + THEMED_PORTAL_CSS }} />}
      <WizardCopyProvider copy={copy}>
        <WizardNavProvider value={nav}>
          <ProductManagementConfigProvider
            value={{
              apiBaseUrl: props.apiBaseUrl ?? "",
              authHeaders: props.authHeaders ?? (() => ({})),
              stripeConnectUrl: () => navigation.hrefs.connectStripe,
            }}
          >
            {portal === "inline" ? (
              <PortalContainerProvider container={portalRoot}>{body}</PortalContainerProvider>
            ) : body}
          </ProductManagementConfigProvider>
        </WizardNavProvider>
      </WizardCopyProvider>
      {portal === "inline" && (
        <div ref={setPortalRoot} className={themed ? "cbt-wizard-portal themed-create-form" : "cbt-wizard-portal"} />
      )}
    </div>
  );
}

function themeVars(theme: ProductCreateWizardTheme | undefined): CSSProperties | undefined {
  if (!theme) return undefined;
  const v: Record<string, string> = {};
  if (theme.textColor) v["--text-color"] = theme.textColor;
  if (theme.bgColor) v["--bg-color"] = theme.bgColor;
  if (theme.brandColor) v["--brand-color"] = theme.brandColor;
  if (theme.brandContrast) v["--brand-contrast"] = theme.brandContrast;
  if (theme.primaryButtonBg) v["--primary-btn-bg"] = theme.primaryButtonBg;
  if (theme.buttonRadius) v["--button-radius"] = theme.buttonRadius;
  if (theme.cardRadius) v["--card-radius"] = theme.cardRadius;
  if (theme.headingFont) v["--heading-font"] = theme.headingFont;
  if (theme.bodyFont) v["--body-font"] = theme.bodyFont;
  return v as CSSProperties;
}

type InnerProps = Omit<ProductCreateWizardProps, "initialDrafts" | "canCreateForCommunity"> & {
  productType: NonNullable<ProductCreateWizardProps["productType"]>;
  isLeader: boolean;
  drafts: ProductDraftSummary[];
  onLocalResume: (d: { id: string; draftStep: string | null }) => void;
};

function WizardInner({
  community, viewer, transport, navigation, extraSteps = [], productType,
  renderContentStep, validateContentStep,
  isLeader: isLeaderHere, drafts: myDrafts, draftId, draftStepFromUrl,
  syncStepToUrl = true, onLocalResume,
}: InnerProps) {
  const { tag: communityTag, id: communityId, name: communityName, memberFeeModel, memberRequireApproval, platformFeeRate } = community;
  const hrefs = navigation.hrefs;
  const navigate = navigation.navigate ?? browserNavigate;
  const t = useWizardT("marketplaceUi.createProductClient");

  const [ownership, setOwnership] = useState<"community" | "personal">("community");
  const effectiveOwnership: "community" | "personal" = isLeaderHere ? ownership : "personal";

  const [packages, setPackages] = useState<ProductFeePackage[]>([]);
  const [packageId, setPackageId] = useState<string | null>(null);

  /*
   * Whether to ask a community to carry this. Defaults TRUE: asking is the
   * common intent. Mirrors CreateProductClient's `wantsListing`, which here
   * becomes `resolveSubmitActions`'s input rather than a separate UI
   * component — see the Listing StepPane below.
   */
  const [wantsListing, setWantsListing] = useState(true);

  const [dismissedResume, setDismissedResume] = useState(false);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const drafts = (draftId ? [] : myDrafts).filter((d) => !discarded.includes(d.id));
  const hasDrafts = !dismissedResume && drafts.length > 0;

  const withContentStep = productType === "COURSE" && !!renderContentStep;
  // The rail (and the resume step's "Left on …") say "course", not "product",
  // once there is a course's own step to show it on — see CreateWizardKind in
  // @cobuntu/management-ui-shared, which carries separate course labels
  // exactly so a course creator is not told they are pricing "product variants".
  const wizardKind = productType === "COURSE" ? ("course" as const) : ("product" as const);

  const baseSteps = resolveCreateSteps({
    canChooseOwnership: isLeaderHere,
    ownership: effectiveOwnership,
    hasPackages: packages.length > 0,
    packageCount: packages.length,
    hasDrafts,
    withCommerceStep: true,
    withContentStep,
    withSettingsStep: true,
  });

  const extraIds = extraSteps.map((s) => s.id);
  const extraLabels = useMemo(() => Object.fromEntries(extraSteps.map((s) => [s.id, s.label])), [extraSteps]);
  const [extraValues, setExtraValues] = useState<Record<string, unknown>>({});
  const [extraErrors, setExtraErrors] = useState<Record<string, boolean>>({});
  const [contentValue, setContentValue] = useState<unknown>(undefined);
  const [contentShowErrors, setContentShowErrors] = useState(false);
  const flowSteps = [...baseSteps, ...extraIds] as CreateStepId[];

  const [rawStep, setStep] = useState<CreateStepId | null>(null);
  const openingStep: CreateStepId = hasDrafts ? "resume" : (isLeaderHere ? "ownership" : "details");

  const [resuming, startResume] = useTransition();
  const [resumingId, setResumingId] = useState<string | null>(null);

  function resumeDraft(d: { id: string; draftStep: string | null }) {
    setResumingId(d.id);
    startResume(() => {
      if (navigation.onResumeDraft) navigation.onResumeDraft(d);
      else onLocalResume(d);
    });
  }

  async function discardDraft(d: { id: string }) {
    setDiscarded((prev) => (prev.includes(d.id) ? prev : [...prev, d.id]));
    try {
      await transport.deleteDraft(d.id);
    } catch {
      setDiscarded((prev) => prev.filter((id) => id !== d.id));
    }
  }

  function startSomethingNew() {
    setDismissedResume(true);
    setStep(isLeaderHere ? "ownership" : "details");
  }

  const step = clampStep(flowSteps, rawStep ?? openingStep);
  const onFinalStep = isFinalStep(flowSteps, step);
  const currentExtra = extraSteps.find((s) => s.id === step);
  const onContentStep = withContentStep && step === "content";

  const [draftRow, setDraftRow] = useState<ProductDraftRow | null>(null);
  const [draftPending, setDraftPending] = useState(!!draftId);
  const draftInitial = useMemo(() => (draftRow ? productDraftToForm(draftRow) : undefined), [draftRow]);

  const resumedFor = useRef<string | null>(null);
  const mounted = useRef(false);
  const draftIdRef = useRef(draftId);
  const leaderRef = useRef(isLeaderHere);
  const stepFromUrlRef = useRef(draftStepFromUrl);
  draftIdRef.current = draftId;
  leaderRef.current = isLeaderHere;
  stepFromUrlRef.current = draftStepFromUrl;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!draftId || resumedFor.current === draftId) return;
    resumedFor.current = draftId;
    setDraftPending(true);
    const live = () => mounted.current && draftIdRef.current === draftId;
    (async () => {
      try {
        let row: ProductDraftRow | null = null;
        try { row = await transport.getDraft(draftId); } catch { row = null; }
        if (!live()) return;
        if (row) {
          setDraftRow(row);
          const leader = leaderRef.current;
          const owned = draftOwnership(row);
          if (leader) setOwnership(owned);
          const steps = resolveCreateSteps({
            canChooseOwnership: leader,
            ownership: leader ? owned : "personal",
            withCommerceStep: true,
            withContentStep,
            withSettingsStep: true,
          });
          const target = resumeStep(stepFromUrlRef.current ?? row.draftStep ?? null, steps);
          if (target) setStep(target);
        }
      } catch {
        // A row that cannot be read is treated like no row at all.
      } finally {
        if (live()) setDraftPending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    if (!syncStepToUrl || !draftId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") === step) return;
    url.searchParams.set("step", step);
    window.history.replaceState(null, "", url.toString());
  }, [syncStepToUrl, draftId, step]);

  const [viewAccess, setViewAccess] = useState<TierAccessValue>({ mode: "public", tierIds: [] });
  const [buyAccess, setBuyAccess] = useState<TierAccessValue>({ mode: "public", tierIds: [] });

  const [direction, setDirection] = useState<"forward" | "back">("forward");
  function goToStep(target: CreateStepId) {
    setDirection(steps.indexOf(target) >= steps.indexOf(step) ? "forward" : "back");
    setStep(target);
  }

  const [created, setCreated] = useState<{ id: string; name: string; outcome: CreateOutcome } | null>(null);
  const steps = created ? [...flowSteps, "done" as const] : flowSteps;
  const railCurrent = created ? ("done" as const) : step;

  const autosaveIdRef = useRef<string>(draftId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));
  const ownershipRef = useRef(effectiveOwnership);
  ownershipRef.current = effectiveOwnership;
  const stepRef = useRef(step);
  stepRef.current = step;
  const savedDraftRef = useRef<string | null>(null);
  const formDataRef = useRef<ProductFormData | null>(null);

  const autosave = useAutosaveDraft({
    draftId: autosaveIdRef.current,
    save: (id, snap, opts) => transport.saveDraft(id, snap, opts),
    getSnapshot: () => {
      const d = formDataRef.current;
      if (!d) return null;
      return {
        name: d.name ?? "",
        description: d.description ?? "",
        categoryId: d.categoryId ?? null,
        subCategoryId: d.subCategoryId ?? null,
        draftStep: stepRef.current,
        // A community-owned draft records the community, or its Drafts list cannot find it.
        communityId: ownershipRef.current === "community" ? communityId : null,
      };
    },
    isEnabled: () => !!formDataRef.current?.name?.trim(),
    onSaved: (id: string) => { savedDraftRef.current = id; },
  });

  const needsPackage = packages.length > 0 && !packageId;

  const cannotTakeCommission = communityCannotTakeCommission({
    ownership: effectiveOwnership,
    payments: community.payments,
    packages,
    packageId,
  });
  const blocksListing = (a: SubmitAction) => a.requestListing && needsPackage;

  const submitActions = resolveSubmitActions({
    canSelfList: isLeaderHere,
    feeModel: memberFeeModel,
    requireApproval: memberRequireApproval,
    wantsListing: flowSteps.includes("listing") ? wantsListing : undefined,
  });
  const listingRequested = submitActions[0]?.kind !== "create";

  const [categories, setCategories] = useState<import("../components/CategoryPickerRow").CategoryOption[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<ProductWizardTier[]>([]);
  useEffect(() => {
    let cancelled = false;
    transport.categories().then((c) => { if (!cancelled) setCategories(Array.isArray(c) ? c : []); }).catch(() => { if (!cancelled) setCategories([]); });
    transport.tiers().then((ts) => { if (!cancelled) setMembershipTiers(Array.isArray(ts) ? ts : []); }).catch(() => { if (!cancelled) setMembershipTiers([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Gated on OWNERSHIP, not the role — mirrors EventCreateWizard.
    if (effectiveOwnership !== "personal") return;
    let cancelled = false;
    (async () => {
      try {
        const list = await transport.myPackages(productType);
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setPackages(arr);
        if (arr.length === 1) setPackageId(arr[0].id);
      } catch {
        if (!cancelled) setPackages([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag, effectiveOwnership, productType]);

  const [showErrors, setShowErrors] = useState(false);
  const [stripeMissing, setStripeMissing] = useState(false);
  const [communityPaymentsMissing, setCommunityPaymentsMissing] = useState(false);
  const [paidIntent, setPaidIntent] = useState(false);
  const [stripeReadiness, setStripeReadiness] = useState<{ loading: boolean; ready: boolean }>({ loading: true, ready: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await transport.stripeStatus();
        const ready = !!data?.connected && !!data?.chargesEnabled;
        if (!cancelled) setStripeReadiness({ loading: false, ready });
      } catch {
        if (!cancelled) setStripeReadiness({ loading: false, ready: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * `requireTiers` scopes the hard "at least one variant" check (2026-10-31)
   * to the places it can actually be answered: leaving the Pricing
   * ("commerce") step, and final submit. `goNext()` also runs this function
   * when LEAVING the "details" step, before the Pricing step has ever been
   * shown — at that point `d.tiers` is still the form's untouched initial
   * state, so checking it there would trap every new product on step one.
   */
  function validationMessage(requireTiers = true): string | null {
    const d = formDataRef.current;
    if (!d || !d.name.trim()) return t("errAddName");
    /*
     * A product needs at least one variant to be listed — something a buyer
     * can actually add to cart. This used to be checked only for a paid
     * product (`d.isPaid`), which let a FREE product through with a blank,
     * unnamed tier and zero actually configured, matching the backend gap
     * assertListable now closes. Both paths route through the same tier
     * count now.
     */
    if (requireTiers && (!d.tiers || d.tiers.length === 0)) return t("errNeedTier");
    if (d.isPaid && d.tiers && d.tiers.length > 0) {
      const anyValid = d.tiers.some(
        (tier) => tier.name.trim() && (tier.priceMode === "pwyw" || (tier.price && parseFloat(tier.price) > 0)),
      );
      if (!anyValid) return t("errPaidTier");
    }
    return null;
  }

  function validateExtra(id: string): string | null {
    const s = extraSteps.find((x) => x.id === id);
    return s?.validate ? s.validate(extraValues[id]) : null;
  }

  /*
   * True when the step on screen right now is the one that already renders
   * its OWN inline warning for a missing name (ProductForm, page="listing",
   * `showErrors && !name.trim()`). Showing the top FormErrorBanner too just
   * repeated the exact same "give it a name" sentence a second time in the
   * same viewport — the redundant-banner bug. Scoped to the "details" step
   * specifically: on any other step the inline warning isn't on screen, so
   * the banner is the only signal and must stay.
   */
  function nameErrorIsAlreadyInline(): boolean {
    return step === "details" && !formDataRef.current?.name?.trim();
  }

  function handleFormChange(data: ProductFormData) {
    formDataRef.current = data;
    autosave.schedule();
    setPaidIntent(!!data.isPaid);
  }

  function goNext() {
    if (step === "details" || step === "commerce") {
      const invalid = validationMessage(step === "commerce");
      if (invalid) { setShowErrors(true); setError(nameErrorIsAlreadyInline() ? "" : invalid); return; }
    }
    if (onContentStep) {
      const v = validateContentStep?.(contentValue) ?? null;
      if (v) { setContentShowErrors(true); setError(v); return; }
    }
    if (currentExtra) {
      const v = validateExtra(currentExtra.id);
      if (v) { setExtraErrors((e) => ({ ...e, [currentExtra.id]: true })); setError(v); return; }
    }
    setError("");
    const target = nextStep(steps, step);
    if (target) goToStep(target);
  }

  function goBack(): boolean {
    const target = previousStep(steps, step);
    if (!target) return false;
    setError("");
    goToStep(target);
    return true;
  }

  function cancel() {
    if (navigation.onCancel) navigation.onCancel();
    else navigate(hrefs.marketplace);
  }

  async function handleCreate(action?: SubmitAction, asDraft?: boolean) {
    if (asDraft) {
      const name = formDataRef.current?.name?.trim();
      if (!name) { setShowErrors(true); setError(nameErrorIsAlreadyInline() ? "" : t("errDraftNeedsName")); return; }
    } else {
      setShowErrors(true);
      const invalid = validationMessage();
      if (invalid) { setError(nameErrorIsAlreadyInline() ? "" : invalid); return; }
      for (const s of extraSteps) {
        const ev = validateExtra(s.id);
        if (ev) {
          setExtraErrors((e) => ({ ...e, [s.id]: true }));
          setError(ev);
          if (step !== s.id) goToStep(s.id as CreateStepId);
          return;
        }
      }
      if (withContentStep) {
        const cv = validateContentStep?.(contentValue) ?? null;
        if (cv) {
          setContentShowErrors(true);
          setError(cv);
          if (step !== "content") goToStep("content");
          return;
        }
      }
    }
    setError("");
    const data = formDataRef.current!;

    if (!asDraft && data.isPaid && !stripeReadiness.ready) {
      setStripeMissing(true);
      return;
    }
    if (!asDraft && data.isPaid && cannotTakeCommission) {
      setCommunityPaymentsMissing(true);
      return;
    }

    setCreating(true);
    setError("");
    setStripeMissing(false);

    try {
      const resolvedView = fromTierAccessValue(viewAccess);
      const resolvedBuy = fromTierAccessValue(buyAccess);
      const formData = buildProductCreateFormData({
        data,
        productType,
        communityTag,
        ownership: effectiveOwnership,
        packageId,
        access: { view: resolvedView, buy: resolvedBuy },
        draft: {
          draftId,
          savedDraftId: savedDraftRef.current,
          asDraft,
          step,
        },
        action: asDraft ? undefined : { publish: action?.publish, requestListing: action?.requestListing },
      });

      const result = await transport.createProduct(formData);
      if (!result.ok) {
        const msg = result.message || t("errFailedCreate");
        if (
          result.code === "STRIPE_REQUIRED" ||
          msg.toLowerCase().includes("connected stripe account") ||
          msg.toLowerCase().includes("connect your stripe account")
        ) {
          setStripeMissing(true);
        } else {
          setError(msg);
        }
        setCreating(false);
        return;
      }

      if (asDraft && productType !== "COURSE") {
        setCreating(false);
        navigate(hrefs.drafts);
        return;
      }

      // Save Draft is never a publish request, so this always resolves to
      // "saved" (or "pending"/"unlisted" if the listing question says so) -
      // never "published". A COURSE draft still needs onDone: it's the only
      // hook that tells the host to continue into syllabus authoring for
      // this product id, so it can't take the early navigate-to-drafts exit
      // the other product types use.
      const outcome = resolveCreateOutcome({
        requestedPublish: asDraft ? false : action?.publish === true,
        canSelfList: isLeaderHere,
        requestedListing: flowSteps.includes("listing") ? wantsListing : undefined,
      });
      const name = (formDataRef.current?.name || "").trim();
      setCreated({ id: result.productId, name, outcome });
      setCreating(false);
      navigation.onDone?.({
        product: { id: result.productId, name },
        outcome,
        action: (asDraft ? "save" : (action?.kind ?? "createRequest")) as SubmitAction["kind"],
        ownership: effectiveOwnership,
        extraValues,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errFailedCreate"));
      setCreating(false);
    }
  }

  const header = currentExtra && !created
    ? { title: currentExtra.title, subtitle: currentExtra.subtitle ?? "" }
    : onContentStep
      ? { title: t(stepHeaderKeys("content" as CreateStepId).title), subtitle: t(stepHeaderKeys("content" as CreateStepId).subtitle, { community: communityName }) }
      : steps.length > 1
        ? { title: t(stepHeaderKeys(railCurrent).title), subtitle: t(stepHeaderKeys(railCurrent).subtitle, { community: communityName }) }
        : { title: t("sellIn", { community: communityName }), subtitle: t("headerSubtitle", { community: communityName }) };

  return (
    <>
      <Breadcrumb
        onBack={created ? undefined : goBack}
        parentHref={hrefs.marketplace}
        parentLabel={t("breadcrumbMarketplace")}
        currentTitle={t("breadcrumbNewProduct")}
        maxWidthClass="max-w-2xl"
        trailing={created ? undefined : <HowItWorksButton href={hrefs.howItWorks} />}
        shouldUseHistoryBack={navigation.shouldUseHistoryBack}
      />
      <div className="mx-auto max-w-2xl px-4 pt-6 md:pt-2 pb-24 max-md:pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 themed-create-form">
      <CreateStepRail steps={steps} current={railCurrent} kind={wizardKind} extraLabels={extraLabels} onStepClick={created ? undefined : goToStep} />

      {!created && (
        <>

      <FirstTimeCreatorModal
        kind="product"
        communityTag={communityTag}
        communityName={communityName}
        sellingGuideHref={hrefs.sellingGuide}
        fullGuideHref={hrefs.fullGuide}
      />

      <style>{THEME_ADAPTER_CSS}</style>

      <header className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-color)" }}>
          {header.title}
        </h1>
        <p className="text-sm opacity-60 mt-1 max-w-[58ch]">
          {header.subtitle}
        </p>
      </header>

      {(stripeMissing || (paidIntent && !stripeReadiness.loading && !stripeReadiness.ready)) && (
        <FormNoticeBanner
          className="mb-6"
          title={t("stripeNoticeTitle")}
          body={t("stripeNoticeBody")}
          actionHref={hrefs.connectStripe}
          actionLabel={t("connectStripe")}
        />
      )}
      {(communityPaymentsMissing || (paidIntent && cannotTakeCommission)) && (
        <FormNoticeBanner
          className="mb-6"
          title={t("communityPaymentsNoticeTitle", { community: communityName })}
          body={t("communityPaymentsNoticeBody", { community: communityName })}
        />
      )}

      <FormErrorBanner message={error} className="mb-6" />

      <div>
          {hasDrafts && (
            <StepPane active={step === "resume"} direction={direction}>
            <ResumeDraftStep
              drafts={drafts}
              onResume={resumeDraft}
              onDiscard={discardDraft}
              resumingId={resuming ? resumingId : null}
              communityName={communityName}
              disabled={creating}
              wizardKind={wizardKind}
            />
            </StepPane>
          )}

          <StepPane active={step === "ownership"} direction={direction}>
              <OwnershipToggle
                value={ownership}
                onChange={setOwnership}
                communityName={communityName}
                communityIconUrl={community.iconUrl}
                viewer={viewer}
                disabled={creating}
                platformFeeRate={platformFeeRate}
              />
            </StepPane>

          {/* Details + commerce + settings share ONE mounted ProductForm;
              `page` flips the half that renders. A plain div, hidden when
              inactive, NOT a StepPane: unmounting would discard the form's own
              state (the tier wizard, the media gallery, the cropped banner). */}
          <div className={step === "details" || step === "commerce" || step === "settings" ? "mt-2" : "hidden"}>
            {draftPending ? (
              <p className="text-sm opacity-60">{t("draftOpening")}</p>
            ) : (
              <ProductForm
                key={draftRow?.id ?? "fresh"}
                page={step === "commerce" ? "commerce" : step === "settings" ? "settings" : "listing"}
                membershipTiers={membershipTiers}
                communityTag={communityTag}
                categories={categories}
                onChange={handleFormChange}
                showErrors={showErrors}
                showTiers
                hideVisibility
                hideRepeatPurchase={productType === "COURSE"}
                productType={productType === "COURSE" ? "DIGITAL" : productType}
                showMemberPricing={effectiveOwnership === "community"}
                ownership={effectiveOwnership}
                initialData={draftInitial}
              />
            )}
          </div>

      {/* The course's syllabus step: a host-supplied renderer, same shape as
          extraSteps — see types.ts's ProductCreateWizardProps.renderContentStep
          for why this package ships no syllabus UI of its own. */}
      {withContentStep && (
        <StepPane active={step === "content"} direction={direction}>
          {renderContentStep!({
            value: contentValue,
            onChange: setContentValue,
            showErrors: contentShowErrors,
            disabled: creating,
          })}
        </StepPane>
      )}

      {/* The arrangement: the only part of the flow that decides what the
          seller is PAID. */}
      <StepPane active={step === "listing"} direction={direction}>
        <div className="max-w-[560px]">
          <div
            onClick={() => setWantsListing(!wantsListing)}
            role="switch"
            aria-checked={wantsListing}
            className="mb-5 flex cursor-pointer items-center justify-between gap-3 rounded-[var(--button-radius,0.75rem)] border px-4 py-3.5"
            style={{ borderColor: "color-mix(in srgb, currentColor 14%, transparent)" }}
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">{t("stepListingTitle")}</span>
              <span className="mt-0.5 block text-[12.5px] opacity-60">{t("stepListingSubtitle", { community: communityName })}</span>
            </span>
            <span
              aria-hidden
              className="relative h-6 w-10 shrink-0 rounded-full transition-colors"
              style={{ background: wantsListing ? "var(--brand-color, #18181b)" : "color-mix(in srgb, currentColor 20%, transparent)" }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                style={{ transform: wantsListing ? "translateX(1.125rem)" : "translateX(0.125rem)" }}
              />
            </span>
          </div>

          {packages.length === 0 && (
            <p className="text-[13.5px] leading-relaxed opacity-65">
              {t("noPackagesNote", { community: communityName })}
            </p>
          )}
          {wantsListing && packages.length > 0 && (
            <div>
              <PackagePicker
                packages={packages}
                value={packageId}
                onChange={setPackageId}
                communityName={communityName}
                platformFee={{ rate: 4, fixedCents: 30, processing: { rate: 1.5, fixedCents: 25 } }}
              />
            </div>
          )}
        </div>
      </StepPane>

          <StepPane active={step === "access"} direction={direction}>
            <ListingAccessStep
              kind="product"
              viewAccess={viewAccess}
              buyAccess={buyAccess}
              onChange={({ viewAccess: v, buyAccess: b }) => { setViewAccess(v); setBuyAccess(b); }}
              tiers={membershipTiers}
              communityName={communityName}
              disabled={creating}
            />
            </StepPane>

          {extraSteps.map((s) => (
            <StepPane key={s.id} active={step === s.id} direction={direction}>
              {s.render({
                value: extraValues[s.id],
                onChange: (next) => setExtraValues((prev) => ({ ...prev, [s.id]: next })),
                showErrors: !!extraErrors[s.id],
                disabled: creating,
              })}
            </StepPane>
          ))}
      </div>

      <div className="csb-scroll-shell hidden md:block fixed bottom-0 right-0 left-0 md:left-[var(--app-sidebar-w,0px)] z-40 border-t border-current/10" style={{ background: "color-mix(in srgb, var(--bg-color) 92%, transparent)", backdropFilter: "blur(10px)" }}>
        <div className="mx-auto flex max-w-[var(--container-max-width,80rem)] items-center justify-between gap-4 px-8 py-3">
          <p className="min-w-0 text-[12.5px] opacity-60">
            {needsPackage && step === "listing" && wantsListing
              ? t("notePickArrangement")
              : step === "resume"
              ? t("noteDrafts")
              : paidIntent && !stripeReadiness.ready
              ? t("connectStripeSubmit")
              : listingRequested ? t("freeToList") : t("unlistedNote")}
          </p>
          <div className="flex shrink-0 items-center gap-2.5">
            {previousStep(steps, step) ? (
              <WizardButton onClick={goBack} disabled={creating}>Back</WizardButton>
            ) : (
              <WizardButton onClick={cancel} disabled={creating}>Cancel</WizardButton>
            )}
            {step === "resume" && (
              <WizardButton primary onClick={startSomethingNew} disabled={creating}>
                {t("draftStartNewProduct")}
              </WizardButton>
            )}
            {step !== "resume" && (
              <WizardButton onClick={() => handleCreate(undefined, true)} disabled={creating}>
                {t("saveDraft")}
              </WizardButton>
            )}
            {!onFinalStep && step !== "resume" && (
              <WizardButton primary onClick={goNext} disabled={creating}>Next</WizardButton>
            )}
            {onFinalStep && submitActions.map((a) => (
              <WizardButton
                key={a.kind}
                primary={a.primary}
                onClick={() => handleCreate(a)}
                disabled={creating || blocksListing(a) || (paidIntent && !stripeReadiness.ready)}
              >
                {creating ? t("creating") : t(a.kind)}
              </WizardButton>
            ))}
          </div>
        </div>
      </div>

      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-current/10 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ background: "color-mix(in srgb, var(--bg-color) 92%, transparent)", backdropFilter: "blur(10px)" }}
      >
        <div className="flex flex-col gap-2">
          {!onFinalStep && step !== "resume" && (
            <WizardButton primary onClick={goNext} disabled={creating}>Next</WizardButton>
          )}
          {onFinalStep && [...submitActions].sort((a, b) => Number(b.primary) - Number(a.primary)).map((a) => (
            <WizardButton
              key={a.kind}
              primary={a.primary}
              onClick={() => handleCreate(a)}
              disabled={creating || blocksListing(a) || (paidIntent && !stripeReadiness.ready)}
            >
              {creating ? t("creating") : t(a.kind)}
            </WizardButton>
          ))}
          {step === "resume" && (
            <WizardButton primary onClick={startSomethingNew} disabled={creating}>
              {t("draftStartNewProduct")}
            </WizardButton>
          )}
          {previousStep(steps, step) ? (
            <WizardButton onClick={goBack} disabled={creating}>Back</WizardButton>
          ) : (
            <WizardButton onClick={cancel} disabled={creating}>Cancel</WizardButton>
          )}
          {step !== "resume" && (
            <WizardButton onClick={() => handleCreate(undefined, true)} disabled={creating}>
              {t("saveDraft")}
            </WizardButton>
          )}
        </div>
      </div>

        </>
      )}

      {created && (
        <CreatedModal
          open
          kind="product"
          outcome={created.outcome}
          name={created.name}
          viewHref={hrefs.viewProduct(created.id)}
          manageHref={hrefs.manageProduct(created.id)}
          reviewHref={hrefs.reviewListing(created.id)}
          createAnotherHref={hrefs.createAnother}
          onNavigate={navigate}
        />
      )}
      </div>
    </>
  );
}
