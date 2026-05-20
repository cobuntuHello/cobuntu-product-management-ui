"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Copy, GripVertical, Lock, FileText } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ModalShell } from "../ui/modal-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useProductManagementConfig, useJsonHeaders } from "../config";
import { MemberPricingSection } from "./MemberPricingSection";

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

export const CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
];

function getSymbol(code: string) { return CURRENCIES.find(c => c.code === code)?.symbol || code; }
function toDisplay(price: number, currency: string) { return currency === "JPY" ? price : price / 100; }
function toSmallestUnit(majorAmount: number, currency: string): number {
  return currency === "JPY" ? Math.round(majorAmount) : Math.round(majorAmount * 100);
}
function fromSmallestUnit(smallestAmount: number, currency: string): string {
  if (smallestAmount == null) return "";
  return String(currency === "JPY" ? smallestAmount : smallestAmount / 100);
}

interface Tier {
  id: string;
  name: string;
  capacity: number | null;
  priceMode?: "fixed" | "pwyw" | null;
  pwywMinAmount?: number | null;
  /** Non-refunded sales for this tier (backend joins via product_snapshots). */
  salesCount?: number;
  products: {
    id: string; price: number; currency: string;
    isRecurring: boolean; recurringInterval: string | null;
    // Installment plan — backend returns these on every GET /tiers since
    // the member-pricing + installments umbrella shipped. Four-or-none
    // for marketplace tiers: total + count + interval + accessDuration
    // (months of access after signup). Distinct from events, where
    // accessDuration is always null (event date bounds access).
    installmentTotalPrice?: number | null;
    installmentCount?: number | null;
    installmentIntervalMonths?: number | null;
    accessDurationMonths?: number | null;
  };
}

interface DraftTier {
  /** Stable client-side key for DnD + react reconciliation. Survives reorder
   *  (whereas `id` only exists once persisted, and index changes on drag). */
  localId: string;
  id?: string;
  name: string;
  price: string;
  currency: string;
  capacity: string;
  isRecurring: boolean;
  recurringInterval: string;
  priceMode: "fixed" | "pwyw";
  pwywMin: string;
  /** Non-refunded sales count. > 0 → price/currency/priceMode locked. */
  salesCount: number;
  // Installment plan — four-or-none. Enabled iff all four numeric values
  // are non-empty valid numbers. Display-unit (e.g. "300", "3", "1",
  // "12") for consistency with the price field; converted on save.
  // Marketplace tiers persist accessDuration; events skip it (event
  // date bounds access).
  installmentEnabled: boolean;
  installmentTotal: string;          // display unit (e.g. "300" = €300 total)
  installmentCount: string;            // integer (e.g. "3" = 3 charges)
  installmentInterval: string;         // integer (e.g. "1" = monthly)
  installmentAccessMonths: string;     // integer (e.g. "12" = 12 months of access)
  // Per-tier registration form metadata. The form lives on tier_forms
  // (one-to-one with product_tiers / event tiers) and is independent of
  // any approval flag — buyers fill it during checkout. These flags
  // drive the per-tier "Registration form" footer badge; the actual
  // builder is mounted on a separate page (admin: /marketplace/:id/form,
  // community-app: /marketplace/:sku/manage/form).
  hasForm: boolean;
  formFieldCount: number;
  deleted?: boolean;
}

function genLocalId(): string {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `local-${Math.random().toString(36).slice(2)}`;
}

interface DonationDraft {
  enabled: boolean;
  mode: "fixed" | "pwyw";
  amounts: string[];
  minAmount: string;
  currency: string;
  label: string;
}

function blankDonation(currency = "EUR"): DonationDraft {
  return { enabled: false, mode: "fixed", amounts: ["5", "10", "25"], minAmount: "", currency, label: "" };
}

function loadDonationFromProduct(product: any): DonationDraft {
  const cfg = product?.donationConfig;
  if (!cfg || typeof cfg !== "object") return blankDonation((product?.currency || "EUR").toUpperCase());
  const currency: string = cfg.currency || product?.currency || "EUR";
  const mode: "fixed" | "pwyw" = cfg.mode === "pwyw" ? "pwyw" : "fixed";
  const amounts: string[] = Array.isArray(cfg.amounts) && cfg.amounts.length > 0
    ? cfg.amounts.map((a: number) => fromSmallestUnit(a, currency))
    : ["5", "10", "25"];
  const minAmount: string = cfg.minAmount != null ? fromSmallestUnit(cfg.minAmount, currency) : "";
  return { enabled: !!cfg.enabled, mode, amounts, minAmount, currency, label: cfg.label || "" };
}

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
   * Optional. When provided, each saved tier card renders a "Registration
   * form" footer that calls this with the tier id. The consumer is
   * responsible for navigating to its form-builder route — the modal
   * itself stays presentation-only. Mirrors the event package's hook
   * exactly, so a tier can declare a buyer form independently of any
   * approval gate (the two axes are not interdependent).
   *
   * When omitted, the footer is hidden — useful for surfaces that don't
   * yet have a builder route wired up.
   */
  onOpenTierForm?: (tierId: string) => void;
}

export function PriceEditModal({ product, communityTag, productId, onClose, onSaved, showToast, manageDetailsUrl, showMemberPricing, onOpenTierForm }: PriceEditModalProps) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftTier[]>([]);
  const [saving, setSaving] = useState(false);
  const [donation, setDonation] = useState<DonationDraft>(() => loadDonationFromProduct(product));
  const [donationDirty, setDonationDirty] = useState(false);

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
          // Pre-fill with parent product's existing price if set
          const parentPrice = product.price ? toDisplay(product.price, product.currency || "EUR") : "";
          setDrafts([{
            localId: genLocalId(),
            name: "Standard",
            price: parentPrice ? String(parentPrice) : "",
            currency: product.currency || "EUR",
            capacity: "",
            isRecurring: !!product.isRecurring,
            recurringInterval: product.recurringInterval || "monthly",
            priceMode: "fixed",
            pwywMin: "",
            salesCount: 0,
            installmentEnabled: false,
            installmentTotal: "",
            installmentCount: "",
            installmentInterval: "1",
            installmentAccessMonths: "",
            hasForm: false,
            formFieldCount: 0,
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
        setDrafts([{ localId: genLocalId(), name: "Standard", price: "", currency: "EUR", capacity: "", isRecurring: false, recurringInterval: "monthly", priceMode: "fixed", pwywMin: "", salesCount: 0, installmentEnabled: false, installmentTotal: "", installmentCount: "", installmentInterval: "1", installmentAccessMonths: "", hasForm: false, formFieldCount: 0 }]);
      } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, communityTag, apiBaseUrl, product.price, product.currency, product.isRecurring, product.recurringInterval]);

  function updateDraft(idx: number, patch: Partial<DraftTier>) {
    setDrafts(d => d.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }
  function addTier() {
    const base = drafts[0];
    setDrafts(d => [...d, {
      localId: genLocalId(),
      name: `Tier ${d.filter(x => !x.deleted).length + 1}`,
      price: "",
      currency: base?.currency || "EUR",
      capacity: "",
      isRecurring: !!base?.isRecurring,
      recurringInterval: base?.recurringInterval || "monthly",
      priceMode: "fixed",
      pwywMin: "",
      salesCount: 0,
      installmentEnabled: false,
      installmentTotal: "",
      installmentCount: "",
      installmentInterval: "1",
      installmentAccessMonths: "",
      hasForm: false,
      formFieldCount: 0,
    }]);
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
      for (const t of drafts.filter(x => !x.deleted)) {
        if (!t.name.trim()) throw new Error("Tier name is required");
        if (t.price === "" || isNaN(parseFloat(t.price))) throw new Error(`Price required for "${t.name}"`);
        if (t.priceMode === "pwyw" && t.pwywMin.trim()) {
          const min = parseFloat(t.pwywMin);
          if (isNaN(min) || min < 0) throw new Error(`Minimum amount for "${t.name}" must be a non-negative number.`);
        }
        // Installment plan — four-or-none + same range bounds as the
        // backend validator (totalPrice > 0, count >= 2, interval >= 1,
        // accessDuration >= 1). Catching it client-side gives the host
        // an inline message instead of a generic 400 toast.
        if (t.installmentEnabled) {
          const total = parseFloat(t.installmentTotal);
          const count = parseInt(t.installmentCount, 10);
          const interval = parseInt(t.installmentInterval, 10);
          const access = parseInt(t.installmentAccessMonths, 10);
          if (isNaN(total) || total <= 0) {
            throw new Error(`Installment total for "${t.name}" must be a positive number.`);
          }
          if (isNaN(count) || count < 2) {
            throw new Error(`Installment count for "${t.name}" must be at least 2.`);
          }
          if (isNaN(interval) || interval < 1) {
            throw new Error(`Installment interval for "${t.name}" must be at least 1 month.`);
          }
          if (isNaN(access) || access < 1) {
            throw new Error(`Access duration for "${t.name}" must be at least 1 month.`);
          }
        }
      }
      if (donation.enabled) {
        if (donation.mode === "fixed") {
          const trimmed = donation.amounts.map(a => a.trim());
          if (trimmed.some(a => a === "")) throw new Error("Fill in or remove blank donation amounts.");
          const invalid = trimmed.find(a => { const n = parseFloat(a); return isNaN(n) || n <= 0; });
          if (invalid !== undefined) throw new Error(`Donation amount "${invalid}" must be a positive number.`);
          if (trimmed.length === 0) throw new Error("At least one donation amount is required when fixed mode is enabled.");
        }
        if (donation.mode === "pwyw" && donation.minAmount.trim()) {
          const n = parseFloat(donation.minAmount);
          if (isNaN(n) || n < 0) throw new Error("Minimum donation must be a non-negative number.");
        }
      }

      // Tier writes
      for (const t of drafts) {
        const pwywMinSmallest = t.priceMode === "pwyw" && t.pwywMin.trim()
          ? toSmallestUnit(parseFloat(t.pwywMin), t.currency)
          : null;
        // Installment plan — four-or-none. Marketplace tiers persist
        // accessDurationMonths (distinct from events). The backend's
        // PUT lock-when-sold guard rejects changes once a sale exists.
        const installmentBody = t.installmentEnabled
          ? {
              installmentTotalPrice: toSmallestUnit(parseFloat(t.installmentTotal), t.currency),
              installmentCount: parseInt(t.installmentCount, 10),
              installmentIntervalMonths: parseInt(t.installmentInterval, 10),
              accessDurationMonths: parseInt(t.installmentAccessMonths, 10),
            }
          : {
              installmentTotalPrice: null,
              installmentCount: null,
              installmentIntervalMonths: null,
              accessDurationMonths: null,
            };
        const body = {
          name: t.name,
          price: parseFloat(t.price || "0"),
          currency: t.currency,
          capacity: t.capacity ? parseInt(t.capacity, 10) : null,
          isRecurring: t.isRecurring,
          recurringInterval: t.isRecurring ? t.recurringInterval : null,
          priceMode: t.priceMode,
          pwywMinAmount: pwywMinSmallest,
          ...installmentBody,
        };
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

      // Donation sidecar
      if (donationDirty) {
        const donationBody = donation.enabled ? buildDonationBody() : null;
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

  function buildDonationBody(): Record<string, unknown> {
    const currency = donation.currency || drafts[0]?.currency || "EUR";
    const base: Record<string, unknown> = { enabled: donation.enabled, mode: donation.mode, currency };
    if (donation.mode === "fixed") {
      base.amounts = donation.amounts
        .map(a => parseFloat(a))
        .filter(a => !isNaN(a) && a > 0)
        .map(a => toSmallestUnit(a, currency));
    } else if (donation.mode === "pwyw") {
      const minRaw = donation.minAmount ? parseFloat(donation.minAmount) : null;
      if (minRaw != null && !isNaN(minRaw)) {
        base.minAmount = toSmallestUnit(minRaw, currency);
      }
    }
    if (donation.label.trim()) base.label = donation.label.trim();
    return base;
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
                  onOpenForm={onOpenTierForm && t.id ? () => onOpenTierForm(t.id!) : undefined}
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

// ─── Sortable tier row ───────────────────────────────────────────────

interface SortableTierRowProps {
  t: DraftTier & { _idx: number };
  communityTag: string;
  canRemove: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  /** Render MemberPricingSection inside the expanded body. Community-
   *  only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  showToast: (msg: string) => void;
  /** When provided, the tier card renders a "Registration form" footer
   *  that invokes this callback. Undefined ⇒ footer hidden (also used for
   *  unsaved drafts where the backend has no tier id to attach a form to). */
  onOpenForm?: () => void;
}

/**
 * DnD-kit wrapper for a tier card. Keeps the card itself presentation-only
 * — it just knows there's a drag handle to render. Mirrors the events
 * package's SortableTierCard so any future refactor that pulls the two
 * implementations together has a clean seam.
 */
function SortableTierRow(props: SortableTierRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.t.localId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <TierCard {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  );
}

/**
 * Pure tier card render. Locked-when-sold disables price/currency/priceMode
 * inputs once `salesCount > 0` — silently allowing those edits would
 * retroactively change what existing buyers paid (the backend's
 * product_snapshot price-sync rewrites the snapshot whenever the
 * linked product changes). The lock + "X sold" badge are the visual
 * cue.
 */
function TierCard({
  t, communityTag, canRemove, onUpdate, onRemove, onDuplicate, showMemberPricing, showToast, onOpenForm, dragAttributes, dragListeners,
}: SortableTierRowProps & { dragAttributes?: any; dragListeners?: any }) {
  const locked = (t.salesCount || 0) > 0;
  return (
    <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
      <div className="p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...dragAttributes} {...dragListeners}
          className="p-1 text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <input
          type="text" value={t.name}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder="Tier name"
          className="flex-1 px-2.5 py-1.5 text-[13px] font-medium text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400"
        />
        {locked && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded">
            {t.salesCount} sold
          </span>
        )}
        {t.id && (
          <button
            onClick={onDuplicate}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 cursor-pointer"
            title="Duplicate tier"
            aria-label="Duplicate tier"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={locked}
            className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={locked ? "Refund all sales before deleting" : "Remove tier"}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1 flex items-center gap-1">
          Pricing model
          {locked && <Lock className="w-3 h-3 text-zinc-400" />}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => !locked && onUpdate({ priceMode: "fixed" })}
            disabled={locked}
            className={`px-3 py-1.5 text-[12px] rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${t.priceMode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "" : "cursor-pointer"}`}
          >Fixed price</button>
          <button type="button" onClick={() => !locked && onUpdate({ priceMode: "pwyw" })}
            disabled={locked}
            className={`px-3 py-1.5 text-[12px] rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${t.priceMode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "" : "cursor-pointer"}`}
          >Pay what you want</button>
        </div>
        {t.priceMode === "pwyw" && (
          <p className="text-[11px] text-zinc-500 mt-1">Buyer chooses the amount at checkout. The price below acts as a suggested default.</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[11px] text-zinc-500 block mb-1 flex items-center gap-1">
            {t.priceMode === "pwyw" ? "Suggested" : "Price"} ({getSymbol(t.currency)})
            {locked && <Lock className="w-3 h-3 text-zinc-400" />}
          </label>
          <input
            type="number" min="0" step="0.01" value={t.price}
            onChange={e => onUpdate({ price: e.target.value })}
            placeholder="0.00"
            disabled={locked}
            className="w-full px-2.5 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <div className="w-[100px]">
          <label className="text-[11px] text-zinc-500 block mb-1 flex items-center gap-1">
            Currency
            {locked && <Lock className="w-3 h-3 text-zinc-400" />}
          </label>
          <Select value={t.currency} onValueChange={v => onUpdate({ currency: v })} disabled={locked}>
            <SelectTrigger className="h-[34px] text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[80px]">
          <label className="text-[11px] text-zinc-500 block mb-1">Capacity</label>
          <input
            type="number" min={locked ? t.salesCount : 0} step="1" value={t.capacity}
            onChange={e => onUpdate({ capacity: e.target.value })}
            placeholder="∞"
            className="w-full px-2.5 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-zinc-700 cursor-pointer">
          <input type="checkbox" checked={t.isRecurring} onChange={e => onUpdate({ isRecurring: e.target.checked })} className="w-3.5 h-3.5" />
          Recurring
        </label>
        {t.isRecurring && (
          <Select value={t.recurringInterval} onValueChange={v => onUpdate({ recurringInterval: v })}>
            <SelectTrigger className="h-[28px] text-[12px] w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {t.priceMode === "pwyw" && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Minimum amount (optional)</label>
          <div className="relative max-w-[180px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{getSymbol(t.currency)}</span>
            <input
              type="number" min="0" step="0.01" value={t.pwywMin}
              onChange={e => onUpdate({ pwywMin: e.target.value })}
              placeholder="No minimum"
              className="w-full pl-7 pr-3 py-1.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
      )}

      {/* Installment plan — opt-in toggle + 4 inputs. Backend enforces
          four-or-none + range bounds (totalPrice > 0, count >= 2,
          interval >= 1, accessDuration >= 1) + lock-when-sold; the
          same checks run client-side in save() so the host sees inline
          errors instead of a generic 400 toast. */}
      <div className="pt-2 border-t border-zinc-100">
        <label className={`flex items-center gap-2 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={t.installmentEnabled}
            disabled={locked}
            onChange={e => onUpdate({ installmentEnabled: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 disabled:cursor-not-allowed"
          />
          <span className={`text-[12px] font-medium ${locked ? "text-zinc-400" : "text-zinc-700"}`}>
            Offer an installment plan
          </span>
          {locked && <Lock className="w-3 h-3 text-zinc-400" />}
        </label>
        <p className="text-[11px] text-zinc-500 mt-1">
          Let buyers pay this tier in equal monthly charges instead of one upfront payment. Access is granted for the duration you set, even if the buyer cancels billing early.
        </p>
        {t.installmentEnabled && (
          <>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Total ({getSymbol(t.currency)})</label>
                <input
                  type="number" min="0" step="0.01" value={t.installmentTotal}
                  onChange={e => onUpdate({ installmentTotal: e.target.value })}
                  placeholder="300"
                  disabled={locked}
                  className="w-full px-2.5 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Charges</label>
                <input
                  type="number" min="2" step="1" value={t.installmentCount}
                  onChange={e => onUpdate({ installmentCount: e.target.value })}
                  placeholder="3"
                  disabled={locked}
                  className="w-full px-2.5 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Every (months)</label>
                <input
                  type="number" min="1" step="1" value={t.installmentInterval}
                  onChange={e => onUpdate({ installmentInterval: e.target.value })}
                  placeholder="1"
                  disabled={locked}
                  className="w-full px-2.5 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Access (months)</label>
                <input
                  type="number" min="1" step="1" value={t.installmentAccessMonths}
                  onChange={e => onUpdate({ installmentAccessMonths: e.target.value })}
                  placeholder="12"
                  disabled={locked}
                  className="w-full px-2.5 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            {t.installmentTotal
              && t.installmentCount
              && parseInt(t.installmentCount, 10) >= 2 && (
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Buyer pays {getSymbol(t.currency)}{(parseFloat(t.installmentTotal) / parseInt(t.installmentCount, 10)).toFixed(2)} every {t.installmentInterval || "1"} month{(t.installmentInterval || "1") !== "1" ? "s" : ""} for {t.installmentCount} charges. {t.installmentAccessMonths ? `Access granted for ${t.installmentAccessMonths} month${t.installmentAccessMonths !== "1" ? "s" : ""}.` : ""}
              </p>
            )}
            {locked && (
              <p className="text-[10px] text-amber-600 mt-1">
                Installment plan is locked while sales exist. Refund all sales first to change.
              </p>
            )}
          </>
        )}
      </div>

      {/* Member pricing — community-only, saved-tiers only. The section
          fetches its own data + commits per-row on its own Save button,
          so it doesn't thread through the outer modal save loop.
          Unsaved drafts skip it (backend needs a real tier id). */}
      {showMemberPricing && t.id && (
        <MemberPricingSection
          communityTag={communityTag}
          tierId={t.id}
          currencyCode={t.currency}
          currencySymbol={getSymbol(t.currency)}
          isRecurringTier={t.isRecurring}
          showToast={showToast}
        />
      )}
      </div>

      {/* Registration-form footer. Mirrors the event package's tier card
          so the marketplace and events surfaces feel like the same product.
          Hidden entirely when the consumer didn't wire onOpenTierForm
          (older callers that haven't adopted the form route yet). Disabled
          for unsaved drafts since the backend keys forms by tier id. */}
      {onOpenForm && (
        <button
          type="button"
          onClick={onOpenForm}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/60 text-left hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!t.id}
          title={!t.id ? "Save this tier first to add a form" : undefined}
        >
          <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-zinc-700">
              Registration form
              {t.hasForm && (
                <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {t.formFieldCount} field{t.formFieldCount !== 1 ? "s" : ""} · Linked
                </span>
              )}
            </p>
            <p className="text-[11px] text-zinc-400 truncate">
              {t.hasForm
                ? "Edit the questions buyers fill out at this tier"
                : t.id
                  ? "Add custom questions for buyers at this tier"
                  : "Save tier to add a form"}
            </p>
          </div>
          <span className="text-[11px] font-medium text-zinc-500 shrink-0">{t.hasForm ? "Manage →" : "Add →"}</span>
        </button>
      )}
    </div>
  );
}

// ─── Donations section ───────────────────────────────────────────────

interface DonationsSectionProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
}

function DonationsSection({ donation, onUpdate, defaultCurrency }: DonationsSectionProps) {
  const sym = getSymbol(donation.currency || defaultCurrency);
  function addAmount() { onUpdate({ amounts: [...donation.amounts, ""] }); }
  function updateAmount(idx: number, value: string) {
    const next = [...donation.amounts]; next[idx] = value;
    onUpdate({ amounts: next });
  }
  function removeAmount(idx: number) {
    onUpdate({ amounts: donation.amounts.filter((_, i) => i !== idx) });
  }
  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden mt-3">
      <div className="px-3 py-2.5 flex items-center gap-3 border-b border-zinc-100">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-900">Donations</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Optional add-on at checkout. Buyer chooses an amount on top of the product price.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onUpdate({ enabled: !donation.enabled })}
          className={`relative shrink-0 rounded-full cursor-pointer transition-colors duration-200 ease-out ${donation.enabled ? "bg-zinc-900" : "bg-zinc-200"}`}
          style={{ width: 36, height: 20 }}
          aria-pressed={donation.enabled}
        >
          <span
            className="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
            style={{ transform: donation.enabled ? "translateX(18px)" : "translateX(2px)" }}
          />
        </button>
      </div>

      {donation.enabled && (
        <div className="px-3 py-3 space-y-3">
          <div>
            <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onUpdate({ mode: "fixed" })}
                className={`px-3 py-2 text-[12px] rounded border cursor-pointer transition-colors ${donation.mode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
              >Suggested amounts</button>
              <button type="button" onClick={() => onUpdate({ mode: "pwyw" })}
                className={`px-3 py-2 text-[12px] rounded border cursor-pointer transition-colors ${donation.mode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
              >Pay what you want</button>
            </div>
          </div>

          {donation.mode === "fixed" && (
            <div>
              <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">Suggested amounts</label>
              <div className="flex flex-wrap gap-2">
                {donation.amounts.map((a, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 pointer-events-none">{sym}</span>
                    <input
                      type="number" min="0" step="0.01" value={a}
                      onChange={e => updateAmount(i, e.target.value)}
                      placeholder="10"
                      className="w-[80px] pl-6 pr-7 py-1.5 text-[13px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {donation.amounts.length > 1 && (
                      <button type="button" onClick={() => removeAmount(i)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-zinc-300 hover:text-red-500 cursor-pointer"
                        aria-label="Remove amount">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {donation.amounts.length < 8 && (
                  <button type="button" onClick={addAmount}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[12px] font-medium text-zinc-500 border border-dashed border-zinc-300 rounded hover:border-zinc-400 hover:text-zinc-700 cursor-pointer">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            </div>
          )}

          {donation.mode === "pwyw" && (
            <div>
              <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">Minimum (optional)</label>
              <div className="relative max-w-[180px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={donation.minAmount}
                  onChange={e => onUpdate({ minAmount: e.target.value })}
                  placeholder="No minimum"
                  className="w-full pl-7 pr-3 py-1.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
