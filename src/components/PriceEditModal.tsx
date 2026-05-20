"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { ModalShell } from "../ui/modal-shell";
import { useProductManagementConfig, useJsonHeaders } from "../config";
import { type MemberPricingSectionHandle } from "./MemberPricingSection";
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
  loadDonationFromProduct,
  toDisplay,
  validateDonation,
  validateTier,
} from "./PriceEditModal/helpers";
import { SortableTierRow } from "./PriceEditModal/TierCard";
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
 *   - Donations sidecar (separately persisted) — suggested amounts or PWYW
 *
 * Unlike events, products do NOT have a notify-attendees prompt (no
 * "attendees" concept) — saves go straight through.
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
   * @deprecated As of slice 4 the form builder is inlined into the
   * EditHub's Form step (see ./PriceEditModal/steps/FormStep.tsx).
   * This prop is retained for backwards compatibility with admin /
   * community-app call sites that still pass it; the value is ignored.
   * Phase C (admin SHA bump) deletes the standalone /form pages and
   * removes this prop from the call sites entirely.
   */
  onOpenTierForm?: (tierId: string) => void;
}

export function PriceEditModal({ product, communityTag, productId, onClose, onSaved, showToast, manageDetailsUrl, showMemberPricing }: PriceEditModalProps) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftTier[]>([]);
  const [saving, setSaving] = useState(false);
  const [donation, setDonation] = useState<DonationDraft>(() => loadDonationFromProduct(product));
  const [donationDirty, setDonationDirty] = useState(false);
  // Imperative refs to each mounted MemberPricingSection (keyed by
  // tier id). The global save() walks these after tier writes succeed
  // so member-pricing overrides commit under the same Save button.
  // Replaces the nested per-section Save button the UX redesign
  // flagged as dual-Save confusion. Mirrors the events package.
  const memberPricingRefs = useRef<Map<string, MemberPricingSectionHandle | null>>(new Map());

  // Stable ref callback so React doesn't detach/reattach the
  // MemberPricingSection handle on every render of the tier list.
  const registerMemberPricingRef = useCallback(
    (tierId: string, handle: MemberPricingSectionHandle | null) => {
      if (handle) memberPricingRefs.current.set(tierId, handle);
      else memberPricingRefs.current.delete(tierId);
    },
    [],
  );

  function updateDonation(patch: Partial<DonationDraft>) {
    setDonationDirty(true);
    setDonation(d => ({ ...d, ...patch }));
  }

  useEffect(() => {
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
            };
          }));
        }
      } catch {
        setDrafts([blankTier()]);
      } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, communityTag, apiBaseUrl, product.price, product.currency, product.isRecurring, product.recurringInterval]);

  function updateDraft(idx: number, patch: Partial<DraftTier>) {
    setDrafts(d => d.map((t, i) => i === idx ? { ...t, ...patch } : t));
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

      // Commit member-pricing overrides via the imperative refs the
      // tier cards register on mount. Each mounted section writes its
      // own dirty rows; the parent never threads the override payloads
      // through the tier save loop (the backend exposes them as a
      // separate sub-resource). Done AFTER tier writes so brand-new
      // tiers — which can't have overrides until their POST returns a
      // tier id — aren't a concern (the section unmounts/remounts on
      // re-fetch). Failures bubble up into the same catch as tier
      // failures.
      for (const [, handle] of memberPricingRefs.current) {
        if (handle && handle.isDirty()) {
          await handle.commit();
        }
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

  const title = visible.length === 0 ? "Add pricing" : visible.length === 1 ? "Edit pricing" : "Pricing tiers";

  return (
    <ModalShell onClose={onClose} width="w-[500px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">{title}</h3>
      <p className="text-[12px] text-zinc-500 mb-4">
        {visible.length <= 1 ? "Set a price, or add multiple tiers." : "Manage pricing tiers."}
      </p>

      {loading ? (
        <div className="py-8 text-center text-[12px] text-zinc-400">Loading…</div>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map(t => t.localId)} strategy={verticalListSortingStrategy}>
              {visible.map(t => (
                <SortableTierRow
                  key={t.localId}
                  t={t}
                  communityTag={communityTag}
                  canRemove={visible.length > 1}
                  onUpdate={patch => updateDraft(t._idx, patch)}
                  onRemove={() => removeTier(t._idx)}
                  onDuplicate={() => duplicateTier(t._idx)}
                  showMemberPricing={!!showMemberPricing}
                  showToast={showToast}
                  registerMemberPricingRef={registerMemberPricingRef}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="flex items-center justify-between pt-1">
            <button onClick={addTier} className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add tier
            </button>
            {manageDetailsUrl && (
              <a href={manageDetailsUrl} className="text-[12px] text-zinc-500 hover:text-zinc-900 no-underline">
                Manage details →
              </a>
            )}
          </div>

          <DonationsSection
            donation={donation}
            onUpdate={updateDonation}
            defaultCurrency={drafts[0]?.currency || "EUR"}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button onClick={save} disabled={saving || loading}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
