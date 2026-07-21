"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { ModalShell } from "../ui/modal-shell";
import { useProductManagementConfig, useJsonHeaders } from "../config";
import { useStripeStatus, StripeRequiredWarning } from "./stripe-status";
import {
  buildRowsFromOverrides,
  buildUpsertBody,
  findFirstValidationError,
  resetRowsBaseline,
  rowIsDirty,
  type CommunitySegment,
  type MemberPricingRow,
  type MemberPricingTierState,
} from "./PriceEditModal/member-pricing";
import {
  type DonationDraft,
  type DraftTier,
  type Tier,
} from "./PriceEditModal/types";
import {
  blankTier,
  buildDonationBody,
  buildTierBody,
  fromSmallestUnit,
  isTierLocked,
  loadDonationFromProduct,
  toDisplay,
  validateDonation,
  validateTier,
} from "./PriceEditModal/helpers";
import { SortableTierRow } from "./PriceEditModal/TierRow";
import { Switch, StepFade } from "./PriceEditModal/_primitives";
import { STEP_TITLES, STEP_SUBTITLES, type StepId } from "./PriceEditModal/TierHubView";
import { TierEditView } from "./PriceEditModal/TierEditView";
import { StepView } from "./PriceEditModal/StepView";
import { FooterSlotContext } from "./PriceEditModal/footer-slot";
import { DonationsSection } from "./PriceEditModal/DonationsSection";
// Backwards-compat export — the original module exported CURRENCIES
// directly. The constant lives on the new types module now; re-export
// it here so admin/community-app call sites importing from
// "@cobuntu/product-management-ui" don't break.
export { CURRENCIES } from "./PriceEditModal/types";

/**
 * Single source of truth for marketplace product pricing.
 *
 * Canonical for both `cobuntu-admin` (community-leader-facing) and
 * `cobuntu-community-app` (seller-facing /marketplace/[sku]/manage).
 *
 * Features:
 *   - Multi-tier pricing with capacity per tier
 *   - PWYW (pay-what-you-want) per tier with optional minimum
 *   - Recurring (subscription) tiers with weekly/monthly/yearly intervals
 *   - Installment plans (4-field: total / count / interval / access months)
 *   - Donations sidecar (separately persisted) — suggested amounts or PWYW
 *
 * UI is the redesigned three-level navigation shared with the events
 * package: Level 1 tier list → Level 2 per-tier hub → Level 3 focused
 * step. The single modal header owns the breadcrumb + ONE title + ONE
 * subtitle; steps render body-only. The footer is the modal's single
 * action bar (a `display:contents` slot lets a step portal its own
 * primary actions in, e.g. the form builder's "+ Question").
 *
 * Unlike events, products do NOT have a notify-attendees prompt (no
 * "attendees" concept) — saves go straight through.
 *
 * Per-tier publish/draft toggle (Level 2 footer) is at parity with the
 * events redesign. The product tier route persists publishedAt + the
 * auto-schedule window (salesStartAt/salesEndAt/autoScheduleEnabled) — wired
 * by the product-tier scheduling track; the PUT is no longer a no-op.
 */

// Currency table, currency conversion helpers, and the Tier /
// DraftTier / DonationDraft shapes live in ./PriceEditModal/types.ts +
// ./PriceEditModal/helpers.ts. Imported above. The standalone helper
// tests exercise them in isolation — see
// src/__tests__/PriceEditModal.helpers.test.ts.

export interface PriceEditModalProps {
  product: any;
  communityTag: string;
  productId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
  /**
   * Optional. If provided, renders a "Manage details →" link inside the
   * modal pointing at the consumer app's tier-details page. The admin app
   * uses `/${tag}/marketplace/${productId}/tiers`; the community-app's URL
   * differs. If omitted, the link is hidden.
   */
  manageDetailsUrl?: string;
  /**
   * When true, the MemberPricingSection is rendered inside each tier
   * card's expanded body — letting community admins configure per-
   * segment discount overrides for this tier. Community-only feature;
   * admin app passes true (admin only edits community-owned products),
   * community-app `/manage` omits / passes false (user-owned products
   * don't get the section).
   *
   * Default: false. The section requires saved-tier ids; rows are
   * hidden for unsaved drafts (no `id`).
   */
  showMemberPricing?: boolean;
  /**
   * Draft mode — no fetches on mount, no backend writes on Save. Used by
   * the create-product flow where the product doesn't exist yet, so the
   * parent (ProductForm) owns the draft state and posts it as part of the
   * create-product payload. Mirrors the event package exactly.
   *
   * In draftMode:
   *   - No GET /tiers (initialDraftTiers seeds drafts instead)
   *   - No GET /stripe status (gate happens at the parent's submit time)
   *   - Member-pricing segments fetch is skipped; the Members step Edit
   *     buttons stay disabled ("Save tier first" copy covers it)
   *   - On Save: validate locally, then call onDraftCommit instead of
   *     POSTing
   */
  draftMode?: boolean;
  /** Initial drafts (from parent's form state). draftMode only. */
  initialDraftTiers?: DraftTier[];
  /** Initial donation (from parent's form state). draftMode only. */
  initialDraftDonation?: DonationDraft;
  /** Called on Save in draftMode. Parent persists the result in its own
   *  form state. Modal then closes via onSaved. */
  onDraftCommit?: (payload: { tiers: DraftTier[]; donation: DonationDraft }) => void;
  /**
   * Open the modal straight on a tier's EDIT screen (Level 2), skipping the
   * list — the tier list now lives inline in the form. Pass the tapped tier's
   * localId (edit) or a freshly-appended blank tier's localId (add). When set,
   * backing out of Level 2 closes the modal instead of returning to the list.
   */
  openTierLocalId?: string;
}

export function PriceEditModal({ product, communityTag, productId, onClose, onSaved, showToast, manageDetailsUrl, showMemberPricing, draftMode, initialDraftTiers, initialDraftDonation, onDraftCommit, openTierLocalId }: PriceEditModalProps) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  // Stripe gate — mirrors the event-side wiring. Hides the tier editor
  // and surfaces a "Connect Stripe" prompt when the community hasn't
  // connected Stripe yet AND any tier on this product is paid. Cached
  // per communityTag inside useStripeStatus so repeated opens of the
  // modal don't re-hit the API.
  const stripe = useStripeStatus(communityTag, { enabled: !draftMode });
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftTier[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishToggling, setPublishToggling] = useState(false);
  const [donation, setDonation] = useState<DonationDraft>(() => draftMode && initialDraftDonation ? initialDraftDonation : loadDonationFromProduct(product));
  const [donationDirty, setDonationDirty] = useState(false);

  // Three-level navigation state. Each non-null value escalates the
  // modal body to a "takeover" view:
  //   activeTier=null, activeStep=null      → Level 1 (tier list)
  //   activeTier=localId, activeStep=null   → Level 2 (per-tier hub)
  //   activeTier=localId, activeStep=basics → Level 3 (focused step)
  // State lives at the modal level so siblings, Add Tier, and
  // Donations actually disappear when the user steps into a tier.
  const [activeTier, setActiveTier] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);

  // Opened directly on a tier from the form's inline list: jump to Level 2
  // (edit screen) once drafts have loaded, once. `openedDirect` also tells the
  // Level-2 back action to CLOSE the modal (the list lives in the form) rather
  // than pop to the in-modal list.
  const openedDirect = !!openTierLocalId;
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (openTierLocalId && !loading && !jumpedRef.current) {
      jumpedRef.current = true;
      setActiveTier(openTierLocalId);
    }
  }, [openTierLocalId, loading]);

  // Footer "step actions" slot. A step that owns primary actions (the
  // form builder's "+ Question" etc.) portals its buttons into this DOM
  // node so the footer stays the modal's single action bar — no buttons
  // scattered through the body. Null until the footer mounts.
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);

  // Member-pricing state — lifted out of MemberPricingSection so it
  // survives tier-card collapse / hub↔step navigation / any unmount.
  // Tied to the modal's lifetime, not the section's. Segments are
  // community-wide (fetched once); per-tier overrides live in the
  // map below keyed by tier id.
  const [memberPricingSegments, setMemberPricingSegments] = useState<CommunitySegment[]>([]);
  const [memberPricingByTier, setMemberPricingByTier] = useState<Map<string, MemberPricingTierState>>(new Map());

  const updateMemberPricingRow = useCallback(
    (tierId: string, idx: number, patch: Partial<MemberPricingRow>) => {
      setMemberPricingByTier((prev) => {
        const tierState = prev.get(tierId);
        if (!tierState || tierState.loading || tierState.error) return prev;
        const newRows = tierState.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
        const next = new Map(prev);
        next.set(tierId, { loading: false, error: null, rows: newRows });
        return next;
      });
    },
    [],
  );

  function updateDonation(patch: Partial<DonationDraft>) {
    setDonationDirty(true);
    setDonation(d => ({ ...d, ...patch }));
  }

  useEffect(() => {
    // Draft mode: parent owns the source of truth. No fetches; seed
    // drafts from initialDraftTiers (or a single blank tier).
    if (draftMode) {
      setDrafts(
        initialDraftTiers && initialDraftTiers.length > 0
          ? initialDraftTiers
          : [blankTier()],
      );
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers`, { headers: authHeaders() });
        const tiers: Tier[] = res.ok ? await res.json() : [];
        if (tiers.length === 0) {
          // Pre-fill with parent product's existing price if set.
          const parentPrice = product.price ? toDisplay(product.price, product.currency || "EUR") : "";
          setDrafts([{
            ...blankTier({
              currency: product.currency || "EUR",
              isRecurring: !!product.isRecurring,
              recurringInterval: product.recurringInterval || "monthly",
            }),
            price: parentPrice ? String(parentPrice) : "",
          }]);
        } else {
          // Probe each tier's form in parallel — there's no batch endpoint,
          // so we fetch /tiers/:id/form individually. 200 with a body =
          // linked, 200 with null body = no form. Mirrors the event
          // package's load flow exactly so the footer badge says the same
          // thing on both surfaces.
          const formChecks = await Promise.all(
            tiers.map(t => fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${t.id}/form`, { headers: authHeaders() })
              .then(async r => r.ok ? await r.json().catch(() => null) : null)
              .catch(() => null)),
          );
          setDrafts(tiers.map((t, i) => {
            const fields = formChecks[i]?.formData?.fields || formChecks[i]?.fields || [];
            return {
              // Saved tiers reuse their backend id as the dnd key. Stable
              // across renders + survives reorder (unlike array index).
              localId: t.id,
              id: t.id,
              name: t.name,
              description: t.description ?? "",
              price: String(toDisplay(t.products.price, t.products.currency)),
              currency: t.products.currency,
              capacity: t.capacity != null ? String(t.capacity) : "",
              isRecurring: !!t.products.isRecurring,
              recurringInterval: t.products.recurringInterval || "monthly",
              priceMode: t.priceMode === "pwyw" ? "pwyw" : "fixed",
              pwywMin: t.pwywMinAmount != null ? fromSmallestUnit(t.pwywMinAmount, t.products.currency) : "",
              salesCount: typeof t.salesCount === "number" ? t.salesCount : 0,
              installmentEnabled: t.products.installmentTotalPrice != null,
              installmentTotal: t.products.installmentTotalPrice != null ? fromSmallestUnit(t.products.installmentTotalPrice, t.products.currency) : "",
              installmentCount: t.products.installmentCount != null ? String(t.products.installmentCount) : "",
              installmentInterval: t.products.installmentIntervalMonths != null ? String(t.products.installmentIntervalMonths) : "1",
              installmentAccessMonths: t.products.accessDurationMonths != null ? String(t.products.accessDurationMonths) : "",
              hasForm: fields.length > 0,
              formFieldCount: fields.length,
              expanded: false,
              // Publish + auto-schedule. Saved tiers preserve their existing
              // publishedAt timestamp so unrelated edits don't overwrite the
              // original publish moment. Window bounds map straight to the
              // datetime-local-compatible ISO strings. The product tier
              // backend currently ignores these (BE track pending), so the
              // fallbacks keep the toggles in a sane "always available"
              // default for existing rows.
              publishedAt: t.publishedAt ?? null,
              autoScheduleEnabled: !!t.autoScheduleEnabled,
              salesStartAt: t.salesStartAt ?? "",
              salesEndAt: t.salesEndAt ?? "",
            };
          }));
        }
      } catch {
        setDrafts([blankTier()]);
      } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, communityTag, apiBaseUrl, product.price, product.currency, product.isRecurring, product.recurringInterval, draftMode]);

  // Fetch community segments once when the modal opens with
  // showMemberPricing on. Mirrors the events package's effect.
  useEffect(() => {
    // Skipped in draftMode — unsaved tiers have no id to attach overrides
    // to, so the Members step shows "Save tier first" instead.
    if (!showMemberPricing || draftMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/communities/${communityTag}/segments`,
          { headers: authHeaders() },
        );
        if (cancelled || !res.ok) return;
        const segments: CommunitySegment[] = await res.json();
        setMemberPricingSegments(segments);
      } catch { /* silent — sections will show "No segments yet" */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemberPricing, communityTag, apiBaseUrl, draftMode]);

  // Lazy per-tier override fetch once segments are loaded.
  useEffect(() => {
    if (!showMemberPricing || memberPricingSegments.length === 0) return;
    const savedTierIds = drafts
      .filter((d) => d.id && !d.deleted)
      .map((d) => d.id!) as string[];
    for (const tierId of savedTierIds) {
      if (memberPricingByTier.has(tierId)) continue;
      setMemberPricingByTier((prev) => {
        const next = new Map(prev);
        next.set(tierId, { loading: true, error: null, rows: [] as never[] });
        return next;
      });
      const tier = drafts.find((d) => d.id === tierId);
      const currency = tier?.currency ?? "EUR";
      (async () => {
        try {
          const res = await fetch(
            `${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`,
            { headers: authHeaders() },
          );
          const overrides: any[] = res.ok ? await res.json() : [];
          const rows = buildRowsFromOverrides(memberPricingSegments, overrides, currency);
          setMemberPricingByTier((prev) => {
            const next = new Map(prev);
            next.set(tierId, { loading: false, error: null, rows });
            return next;
          });
        } catch (e: any) {
          setMemberPricingByTier((prev) => {
            const next = new Map(prev);
            next.set(tierId, { loading: false, error: e?.message || "Failed to load", rows: [] as never[] });
            return next;
          });
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemberPricing, memberPricingSegments, drafts.map((d) => d.id).join(",")]);

  function updateDraft(idx: number, patch: Partial<DraftTier>) {
    setDrafts(d => d.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }

  /**
   * Per-tier publish toggle for the L2 (tier-hub) footer. Publishing is a
   * top-level rollout action, so the Switch hits the backend IMMEDIATELY
   * (no Save): a saved tier PUTs { publishedAt } — an ISO string to
   * publish, null to unpublish. The draft flips optimistically and
   * reverts if the request fails. A brand-new (unsaved) tier has no id to
   * PUT against, so the toggle just stages publishedAt on the draft; it
   * persists on the tier's first save.
   *
   * Backend: ProductTierService accepts `publishedAt` (along with
   * `salesStartAt`/`salesEndAt` and `autoScheduleEnabled`) — same shape
   * as EventTierService. Wired in feat/storefront-tier-sale-state (Track
   * 2a, mid-2026-06).
   */
  async function togglePublish(idx: number) {
    const tier = drafts[idx];
    if (!tier) return;
    const prevPublishedAt = tier.publishedAt;
    const nextPublishedAt = tier.publishedAt ? null : new Date().toISOString();
    updateDraft(idx, { publishedAt: nextPublishedAt });
    if (!tier.id) return; // unsaved → persists when the tier is first saved
    setPublishToggling(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers/${tier.id}`,
        { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ publishedAt: nextPublishedAt }) },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to update publish state");
      }
      showToast(nextPublishedAt ? "Tier published" : "Tier unpublished");
    } catch (e: any) {
      updateDraft(idx, { publishedAt: prevPublishedAt }); // revert optimistic flip
      showToast(e.message || "Failed to update publish state");
    } finally {
      setPublishToggling(false);
    }
  }

  function addTier() {
    const base = drafts[0];
    setDrafts(d => [
      ...d,
      blankTier({
        currency: base?.currency || "EUR",
        isRecurring: !!base?.isRecurring,
        recurringInterval: base?.recurringInterval || "monthly",
        indexHint: d.filter(x => !x.deleted).length + 1,
      }),
    ]);
  }
  function removeTier(idx: number) {
    setDrafts(d => {
      const t = d[idx];
      if (!t.id) return d.filter((_, i) => i !== idx);
      return d.map((x, i) => i === idx ? { ...x, deleted: true } : x);
    });
  }

  /**
   * Duplicate an existing (persisted) tier via the backend's
   * `copyFromTierId` shortcut. The backend clones name/price/currency/
   * recurring config under the same parent product, fresh sku, capacity
   * reset. Refreshes the local list with the new tier returned.
   */
  async function duplicateTier(idx: number) {
    const src = drafts[idx];
    if (!src?.id) {
      showToast("Save the tier before duplicating it");
      return;
    }
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers`,
        { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ copyFromTierId: src.id }) },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to duplicate tier");
      }
      const newTier: Tier = await res.json();
      setDrafts(d => [...d, {
        localId: newTier.id,
        id: newTier.id,
        name: newTier.name,
        description: newTier.description ?? "",
        price: String(toDisplay(newTier.products.price, newTier.products.currency)),
        currency: newTier.products.currency,
        capacity: newTier.capacity != null ? String(newTier.capacity) : "",
        isRecurring: !!newTier.products.isRecurring,
        recurringInterval: newTier.products.recurringInterval || "monthly",
        priceMode: newTier.priceMode === "pwyw" ? "pwyw" : "fixed",
        pwywMin: newTier.pwywMinAmount != null ? fromSmallestUnit(newTier.pwywMinAmount, newTier.products.currency) : "",
        salesCount: 0,
        // Backend's cloneTier carries the installment plan over, so
        // hydrate from the cloned response (admin's intuition is that
        // "Duplicate" gives a fully-configured copy).
        installmentEnabled: newTier.products.installmentTotalPrice != null,
        installmentTotal: newTier.products.installmentTotalPrice != null ? fromSmallestUnit(newTier.products.installmentTotalPrice, newTier.products.currency) : "",
        installmentCount: newTier.products.installmentCount != null ? String(newTier.products.installmentCount) : "",
        installmentInterval: newTier.products.installmentIntervalMonths != null ? String(newTier.products.installmentIntervalMonths) : "1",
        installmentAccessMonths: newTier.products.accessDurationMonths != null ? String(newTier.products.accessDurationMonths) : "",
        // Backend's clone doesn't carry tier_forms across — the new tier
        // starts blank. Footer renders the "Add →" state until the seller
        // builds one.
        hasForm: false,
        formFieldCount: 0,
        expanded: false,
        // Scheduling defaults for the cloned row (BE track pending).
        publishedAt: newTier.publishedAt ?? null,
        autoScheduleEnabled: !!newTier.autoScheduleEnabled,
        salesStartAt: newTier.salesStartAt ?? "",
        salesEndAt: newTier.salesEndAt ?? "",
      }]);
    } catch (e: any) {
      showToast(e.message || "Failed to duplicate tier");
    }
  }

  /**
   * DnD reorder. On drag-end we shuffle `drafts` locally for instant
   * feedback, then PUT /tiers/reorder with the new id order to
   * persist. Only saved tiers can be reordered server-side; unsaved
   * drafts keep their local order until they're created.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const visibleIds = drafts.filter(d => !d.deleted).map(d => d.localId);
    const oldIndex = visibleIds.indexOf(String(active.id));
    const newIndex = visibleIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedVisible = arrayMove(
      drafts.filter(d => !d.deleted),
      oldIndex, newIndex,
    );
    // Merge reordered visible drafts back with any soft-deleted ones (kept
    // out of view but still tracked so DELETE fires on save).
    const deleted = drafts.filter(d => d.deleted);
    setDrafts([...reorderedVisible, ...deleted]);

    // Persist the new order if all the reordered tiers are saved already.
    const ids = reorderedVisible.map(t => t.id).filter((id): id is string => !!id);
    if (ids.length === reorderedVisible.length) {
      try {
        await fetch(`${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers/reorder`, {
          method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ tierIds: ids }),
        });
      } catch { /* non-fatal — next save will retry */ }
    }
  }

  const visible = drafts.map((t, idx) => ({ ...t, _idx: idx })).filter(t => !t.deleted);

  // Member-pricing fetches are async per saved tier. If the seller clicks
  // Save before any of them resolve, the save loop iterates an incomplete
  // map and silently omits per-tier overrides. Block Save until every
  // saved tier either has its rows loaded or has errored (errored slots
  // are skipped by the save loop, so they're safe to allow). Only matters
  // when showMemberPricing is on.
  //
  // CRITICAL: gate on `memberPricingSegments.length > 0`. When a community has
  // NO segments the per-tier fetch effect returns early (nothing to fetch), so
  // `memberPricingByTier` never populates and a saved tier's state stays
  // undefined — which read as "still loading" forever, permanently DISABLING
  // Save (clicking it did nothing, no toast). With no segments there is
  // nothing to load or commit, so it must not be pending. (A saved tier + a
  // community with no membership segments = every no-segment community could
  // not save product/event tiers.)
  const memberPricingPending = !!showMemberPricing && memberPricingSegments.length > 0 && drafts.some((d) => {
    if (!d.id || d.deleted) return false;
    const state = memberPricingByTier.get(d.id);
    return !state || state.loading;
  });

  async function save() {
    setSaving(true);
    try {
      // Validate tiers — pure helper returns the first failure message,
      // or null when the draft is valid. Four-of-none installment rules
      // + pwyw min bounds live in helpers.ts so they're test-covered in
      // isolation (PriceEditModal.helpers.test.ts).
      for (const t of drafts.filter(x => !x.deleted)) {
        const err = validateTier(t);
        if (err) throw new Error(err);
      }
      const donationErr = validateDonation(donation);
      if (donationErr) throw new Error(donationErr);

      // Draft mode: hand the validated drafts to the parent and close. No
      // backend writes — the parent (ProductForm) owns the source of truth
      // and POSTs these as part of the create-product payload. Member-
      // pricing + forms need a saved tier id, so they stay edit-time (same
      // as events); the modal already shows "Save tier first" for them.
      if (draftMode) {
        const liveDrafts = drafts.filter((d) => !d.deleted);
        onDraftCommit?.({ tiers: liveDrafts, donation });
        showToast("Pricing saved");
        onSaved();
        return;
      }

      // Tier writes
      for (const t of drafts) {
        const body = buildTierBody(t);
        if (t.deleted && t.id) {
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers/${t.id}`, { method: "DELETE", headers: authHeaders() });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed to delete "${t.name}"`); }
        } else if (t.id) {
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers/${t.id}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(body) });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed to update "${t.name}"`); }
        } else if (!t.deleted) {
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/tiers`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed to create "${t.name}"`); }
        }
      }

      // Commit member-pricing overrides from the modal-level state
      // map. The map outlives any tier-card unmount, so dirty rows
      // survive the user collapsing a tier between edit and Save.
      // Done AFTER tier writes so brand-new tiers — which can't have
      // overrides until their POST returns a tier id — aren't a
      // concern (we iterate by tierId; new tiers without an id don't
      // appear in the map). Product-specific delta vs events: the
      // upsert body carries recurringScope for subscription tiers.
      const memberPricingResets: Array<[string, MemberPricingRow[]]> = [];
      for (const [tierId, tierState] of memberPricingByTier) {
        if (tierState.loading || tierState.error) continue;
        const valErr = findFirstValidationError(tierState.rows);
        if (valErr) throw new Error(valErr);
        const dirtyRows = tierState.rows.filter(rowIsDirty);
        if (dirtyRows.length === 0) continue;

        const tier = drafts.find((d) => d.id === tierId);
        const currency = tier?.currency ?? "EUR";
        const isRecurringTier = !!tier?.isRecurring;
        for (const r of dirtyRows) {
          if (r.initial?.enabled && !r.enabled && r.initial.id) {
            const res = await fetch(
              `${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing/${r.initial.id}`,
              { method: "DELETE", headers: authHeaders() },
            );
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || `Failed to remove override for ${r.segmentName}`);
            }
            continue;
          }
          if (r.enabled) {
            const body = buildUpsertBody(r, currency, isRecurringTier);
            const res = await fetch(
              `${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`,
              { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) },
            );
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || `Failed to save override for ${r.segmentName}`);
            }
          }
        }
        memberPricingResets.push([tierId, resetRowsBaseline(tierState.rows)]);
      }
      if (memberPricingResets.length > 0) {
        setMemberPricingByTier((prev) => {
          const next = new Map(prev);
          for (const [tierId, rows] of memberPricingResets) {
            next.set(tierId, { loading: false, error: null, rows });
          }
          return next;
        });
      }

      // Donation sidecar. PUT receives null when disabled so the
      // backend clears server state.
      if (donationDirty) {
        const donationBody = buildDonationBody(donation, drafts[0]?.currency || "EUR");
        const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/products/${productId}/donations`, {
          method: "PUT",
          headers: jsonHeaders(),
          body: JSON.stringify(donationBody),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Failed to save donation settings");
        }
      }

      showToast("Pricing updated");
      onSaved();
    } catch (e: any) { showToast(e.message || "Failed to save"); }
    finally { setSaving(false); }
  }

  const isEmpty = drafts.every(t => t.deleted) || (drafts.length === 1 && !drafts[0].id && !drafts[0].price);

  // Active draft for L2 / L3 takeover views. Keyed by tier.localId
  // (NOT tier.id) so brand-new unsaved tiers work the same way.
  const activeDraft = activeTier
    ? drafts.find(d => d.localId === activeTier && !d.deleted)
    : null;

  function activeIdx(): number | null {
    if (!activeDraft) return null;
    const idx = drafts.findIndex(d => d.localId === activeDraft.localId);
    return idx >= 0 ? idx : null;
  }

  // ─── Header model — ONE title + ONE subtitle per level, plus a
  // breadcrumb trail so the user always knows where they are and can hop
  // back. Previously each surface rendered its own heading; now the modal
  // owns the single source of truth and the steps render body-only.
  //
  //   L1 (tier list): no breadcrumb · title "Pricing tiers" / "Edit
  //                   pricing" / "Add pricing" · descriptive subtitle.
  //   L2 (tier hub):  breadcrumb [Pricing tiers] · title = tier name ·
  //                   subtitle "Choose what to configure".
  //   L3 (step):      breadcrumb [Pricing tiers › {tier}] · title =
  //                   STEP_TITLES[step] · subtitle = STEP_SUBTITLES[step].
  const tierName = activeDraft?.name?.trim() || "Untitled tier";
  const title =
    activeDraft && activeStep
      ? STEP_TITLES[activeStep]
      : activeDraft
        ? tierName
        : isEmpty
          ? "Add pricing"
          : visible.length === 1
            ? "Edit pricing"
            : "Pricing tiers";
  const subtitle =
    activeDraft && activeStep
      ? STEP_SUBTITLES[activeStep]
      : activeDraft
        ? "Buyers pick one tier at checkout."
        : "Tiers, donations, and per-tier registration forms.";

  // Breadcrumb segments — each is clickable except the last (current
  // level). L1 has none. Clicking a crumb pops navigation back to it.
  const crumbs: Array<{ label: string; onClick?: () => void }> = [];
  if (activeDraft) {
    // When opened directly on a tier (list lives in the form), the tier edit
    // screen is the root — no "Pricing tiers" crumb. From a sub-step, the only
    // crumb is the tier name (back to the edit screen).
    if (!openedDirect) {
      crumbs.push({
        label: "Pricing tiers",
        onClick: () => {
          setActiveStep(null);
          setActiveTier(null);
        },
      });
    }
    if (activeStep) {
      crumbs.push({ label: tierName, onClick: () => setActiveStep(null) });
    }
  }

  // Stripe gate — show the "Connect Stripe" warning instead of the tier
  // editor when (a) the community isn't connected (or has charges
  // disabled) AND (b) at least one tier on this product is paid. We
  // wait until the initial tier fetch completes (`loading=false`) and
  // the Stripe status resolves (`stripe.loading=false`) to avoid
  // flashing the warning on the way to a benign all-free product.
  // Stripe gate doesn't apply in draftMode — the parent's create-product
  // submit does the connected-account check at the right moment.
  const hasPaidTier = drafts.some((d) => !d.deleted && parseFloat(d.price || "0") > 0);
  if (!draftMode && !loading && !stripe.loading && !stripe.chargesEnabled && hasPaidTier) {
    return <StripeRequiredWarning communityTag={communityTag} onClose={onClose} />;
  }

  return (
    <ModalShell onClose={onClose} width="w-[600px]">
      <FooterSlotContext.Provider value={footerSlot}>
      <div className="relative flex flex-col max-h-[78vh]">
      {/* Circular close — muted bg, top-right of the modal. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -top-1 -right-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors cursor-pointer"
      >
        <X className="h-[18px] w-[18px]" />
      </button>
      {/* ─── Header ─── ONE breadcrumb + ONE title + ONE subtitle. */}
      <div className="shrink-0 mb-4 pr-9">
        {crumbs.length > 0 && (
          <nav className="flex items-center flex-wrap gap-1 mb-1.5 text-[12px]" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-zinc-300" aria-hidden>›</span>}
                <button
                  type="button"
                  onClick={c.onClick}
                  className="text-zinc-500 hover:text-zinc-900 hover:underline cursor-pointer transition-colors"
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        )}
        <h3 className="text-[16px] font-semibold text-zinc-900">{title}</h3>
        {subtitle && (
          <p className="text-[12px] text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Body — the sole flexible region; scrolls when a level's content
          is taller than the fixed column. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {/* Cross-fade between levels/steps. Keyed on the current view so
          each navigation re-mounts and animates in (see StepFade). */}
      <StepFade stepKey={`${activeTier ?? "list"}:${activeStep ?? "hub"}:${loading ? "loading" : "ready"}`}>
      {loading ? (
        <div className="py-12 text-center text-[13px] text-zinc-400">Loading…</div>
      ) : activeDraft && activeStep ? (
        // L3: step takeover. Hides siblings + Add Tier + Donations.
        // Footer Back returns to L2.
        <StepView
          t={activeDraft}
          step={activeStep}
          communityTag={communityTag}
          onUpdate={(patch) => {
            const idx = activeIdx();
            if (idx != null) updateDraft(idx, patch);
          }}
          showMemberPricing={!!showMemberPricing}
          memberPricingState={activeDraft.id ? memberPricingByTier.get(activeDraft.id) : undefined}
          onMemberPricingRowChange={
            activeDraft.id
              ? (idx, patch) => updateMemberPricingRow(activeDraft.id!, idx, patch)
              : undefined
          }
          showToast={showToast}
        />
      ) : activeDraft ? (
        // L2: per-tier EDIT screen — name/description/pricing inline, the rest
        // as Advanced rows that drill into a sub-step (Level 3).
        <TierEditView
          t={activeDraft}
          onUpdate={(patch) => {
            const idx = activeIdx();
            if (idx != null) updateDraft(idx, patch);
          }}
          onEnterStep={(step) => setActiveStep(step)}
          showMemberPricing={!!showMemberPricing}
          memberPricingState={activeDraft.id ? memberPricingByTier.get(activeDraft.id) : undefined}
          onMemberPricingRowChange={
            activeDraft.id
              ? (idx, patch) => updateMemberPricingRow(activeDraft.id!, idx, patch)
              : undefined
          }
          showToast={showToast}
        />
      ) : (
        // L1: default tier list. Add tier + Donations + Save.
        <div className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map(t => t.localId)} strategy={verticalListSortingStrategy}>
              {visible.map(t => (
                <SortableTierRow
                  key={t.localId}
                  t={t}
                  onSelect={() => setActiveTier(t.localId)}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="flex items-center justify-between pt-1">
            {/* Add tier — appends a draft AND auto-navigates into its
                hub view, matching the user's intent of "create + edit". */}
            <button
              onClick={() => {
                addTier();
                // After addTier updates drafts, the new tier sits at the
                // end. Use a microtask to read the next-state localId.
                setTimeout(() => {
                  setDrafts((curr) => {
                    const last = curr[curr.length - 1];
                    if (last) setActiveTier(last.localId);
                    return curr;
                  });
                }, 0);
              }}
              className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add tier
            </button>
            {manageDetailsUrl && (
              <a href={manageDetailsUrl} className="text-[12px] text-zinc-500 hover:text-zinc-900 no-underline">
                Manage details →
              </a>
            )}
          </div>

          {/* Donations sidecar — independent of tiers. Saved via PUT
              /donations alongside tier writes when changed. */}
          <DonationsSection
            donation={donation}
            onUpdate={updateDonation}
            defaultCurrency={drafts[0]?.currency || "EUR"}
          />
        </div>
      )}
      </StepFade>
      </div>

      {/* ─── Footer ─── Modal-level navigation + Save.
          L1 (tier list):   [Cancel]                           [Save]
          L2 (per-tier hub): [Back] [Delete] [Duplicate] [Pub]
          L3 (step):        [Back]                             [Save]
          Save always commits everything regardless of level.
          Back / Cancel / Delete / Duplicate live here so the action
          surface stays predictable across levels — no inline pill-shaped
          affordances inside the body. */}
      <div className="shrink-0 flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100">
        {activeDraft && activeStep ? (
          <button
            type="button"
            onClick={() => setActiveStep(null)}
            className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            Back
          </button>
        ) : activeDraft ? (
          <>
            <button
              type="button"
              onClick={() => (openedDirect ? onClose() : setActiveTier(null))}
              className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              {openedDirect ? "Cancel" : "Back"}
            </button>
            {/* Delete is ALWAYS shown (no hiding features without
                explanation). When it can't proceed it says why via a toast
                instead of being hidden/disabled:
                  - locked tier (has sales) → refund-first message
                  - last/only tier → "needs at least one tier" */}
            <button
              type="button"
              onClick={() => {
                if (isTierLocked(activeDraft)) {
                  showToast("Refund all sales before deleting this tier.");
                  return;
                }
                if (visible.length <= 1) {
                  showToast("A product needs at least one tier — add another before deleting this one.");
                  return;
                }
                const idx = activeIdx();
                if (idx != null) {
                  removeTier(idx);
                  setActiveTier(null);
                }
              }}
              className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors"
            >
              Delete
            </button>
            {activeDraft.id && (
              <button
                type="button"
                onClick={() => {
                  const idx = activeIdx();
                  if (idx != null) duplicateTier(idx);
                }}
                className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                Duplicate
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
          >
            Cancel
          </button>
        )}
        <div className="flex-1" />
        {/* Per-step action slot. Steps with their own primary actions
            (e.g. the form builder's "+ Question" / "+ Page break") portal
            their buttons in here so the footer is the modal's single
            action bar. `contents` → buttons sit directly in this flex row,
            left of Save. Empty (zero-width) for steps that don't use it. */}
        <div ref={setFooterSlot} className="contents" />
        {/* L2 (per-tier hub): a Publish switch sits left of Save. Publishing
            is a top-level rollout action that hits the backend instantly
            (no Save) — see togglePublish. */}
        {activeDraft && !activeStep && (
          <div className="flex items-center gap-2 mr-1">
            <span className="text-[12px] font-medium text-zinc-600">
              {activeDraft.publishedAt ? "Published" : "Draft"}
            </span>
            <Switch
              checked={!!activeDraft.publishedAt}
              disabled={publishToggling}
              onChange={() => {
                const idx = activeIdx();
                if (idx != null) togglePublish(idx);
              }}
              label="Published"
            />
          </div>
        )}
        {/* Save shows at every level now — L2 is a real edit screen (name,
            description, pricing inline), so it commits from here too. Save
            always commits the whole modal. */}
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || memberPricingPending}
          title={memberPricingPending ? "Loading member pricing…" : undefined}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      </div>
      </FooterSlotContext.Provider>
    </ModalShell>
  );
}
