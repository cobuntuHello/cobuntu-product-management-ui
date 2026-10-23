"use client";

import { useState } from "react";
import { ChevronRight, Layers } from "lucide-react";
import { PriceEditModal } from "../../components/PriceEditModal";
import { getSymbol, toDisplay } from "../../components/PriceEditModal/helpers";
import { useCanEdit } from "../../lib/manageAccess";

/**
 * PRICING TAB — the variant list, as the create wizard shows it.
 *
 * Variants were reachable from Details through one small "price" control on the
 * product card, which opened PriceEditModal on its Level 1 list: a column of
 * compact rows. The create wizard had already moved past that to a full-width
 * card per variant — name, price, and a fact strip showing what lives inside —
 * with the whole card as the tap target into that variant's editor.
 *
 * So a seller met two different models for the same object depending on whether
 * the product existed yet, and the worse one was the one they returned to for
 * the rest of its life. This is the wizard's pattern, on the manage page.
 *
 * The event package got the same tab first (cobuntu-event-management-ui#187).
 * This is deliberately its sibling rather than a shared component: the two
 * fact strips differ because the objects differ (tickets have capacity and a
 * sign-up form; variants have files, a licence and a physical shape), and the
 * two packages are versioned independently, so sharing it would couple their
 * release cycles for the sake of ~40 lines of markup.
 *
 * COURSES COME THROUGH HERE TOO. A course is a product with
 * productType: COURSE — @cobuntu/course-management-ui owns only the curriculum
 * builder, while the form and this manage page come from this package. So this
 * one view serves products and courses, and `productType` is forwarded to the
 * modal so it keeps whatever type-specific behaviour it already has.
 *
 * WHAT DIFFERS FROM THE WIZARD, AND HAS TO
 *
 * The wizard runs PriceEditModal in `draftMode`: no fetches, no writes, the
 * parent owns the drafts until the create payload posts. Here the product
 * exists, so the modal runs in its normal mode and each Save is a real write.
 * The pixels match; the data flow is inverted.
 *
 * `openTierLocalId` is what lands the card on that variant's editor instead of
 * the list. It already existed for the wizard and works unchanged outside
 * draftMode, because saved tiers reuse their backend id as `localId`
 * (PriceEditModal:305).
 *
 * The facts come from `product.tiers`, which the page already holds, so this
 * view carries no loading state of its own. That bounds what it can report:
 * file counts and attribute counts live on the modal's own richer fetch, not
 * in this payload, so they are not claimed here rather than being rendered as
 * a confident "None".
 */

export interface PricingViewProps {
  product: any;
  communityTag: string;
  productId: string;
  /** Refetch after a write so the cards reflect what was saved. */
  onUpdate: () => void;
  showToast: (msg: string) => void;
  /** Community-owned products only; segments are community-scoped. */
  showMemberPricing?: boolean;
}

/** One fact-strip cell, matching the wizard's. */
function Fact({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex-1 min-w-[110px] px-4 py-2.5 border-r border-zinc-100 last:border-r-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{k}</p>
      <p
        className="text-[13px] font-medium mt-0.5 tabular-nums"
        style={{ color: color ?? "#27272a" }}
      >
        {v}
      </p>
    </div>
  );
}

/**
 * The price line, mirroring the wizard's variantPriceLabel but reading the
 * SAVED shape: pay-what-you-want, then a recurring suffix, then free.
 *
 * Prices arrive in the SMALLEST UNIT. toDisplay is the same conversion the
 * modal applies when it loads these rows, so the card and the editor cannot
 * disagree — reading the raw column renders 2500 as "2500.00" instead of
 * "25.00", which is a hundredfold error on the one number a seller checks and
 * looks perfectly fine on screen.
 */
function priceLabel(t: any): string {
  const cur = t?.products?.currency || "EUR";
  if (t?.priceMode === "pwyw") return "Pay what you want";
  const minor = Number(t?.products?.price ?? 0);
  if (!minor || minor <= 0) return "Free";
  const base = `${getSymbol(cur)}${toDisplay(minor, cur).toFixed(2)}`;
  return t?.products?.isRecurring
    ? `${base}/${t.products.recurringInterval === "yearly" ? "yr" : "mo"}`
    : base;
}

export function PricingView({
  product,
  communityTag,
  productId,
  onUpdate,
  showToast,
  showMemberPricing,
}: PricingViewProps) {
  /** A tier id, "__new__", or null. */
  const [editingTier, setEditingTier] = useState<string | null>(null);

  /*
   * READ-ONLY GATE.
   *
   * A community leader whose community merely CARRIES someone else's product
   * is not its seller and must not reprice it. The cards stay visible — what a
   * product costs is not a secret from the leader listing it — but every
   * opener is blocked and the Add affordance is withheld, rather than opening
   * an editor whose Save the API would refuse.
   */
  const canEdit = useCanEdit();
  const openTier = (key: string) => {
    if (!canEdit) return;
    setEditingTier(key);
  };

  const tiers: any[] = Array.isArray(product?.tiers) ? product.tiers : [];
  const productType: string = product?.productType || "DIGITAL";
  const isPhysical = productType === "PHYSICAL";

  const close = () => setEditingTier(null);
  const saved = () => {
    setEditingTier(null);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">Variants</h2>
        <p className="text-[12px] text-zinc-500 mt-1 mb-4 max-w-[68ch] leading-relaxed">
          Each variant is a version buyers can purchase, with its own price, capacity and
          {isPhysical ? " stock" : " downloadable content"}. Open one to edit it.
        </p>

        {tiers.length > 0 && (
          <div className="space-y-2 mb-3">
            {tiers.map((t: any) => {
              const cap = t?.capacity != null ? Number(t.capacity) : null;
              // `tier_forms` is the relation, `formId` the denormalised column.
              // Either means a form is linked.
              const hasForm = (t?.tier_forms && t.tier_forms.length > 0) || !!t?.formId;
              const published = !!t?.publishedAt;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTier(t.id)}
                  className="group w-full text-left rounded-xl bg-white border border-zinc-100 hover:bg-zinc-50 hover:border-zinc-200 transition-all duration-150 cursor-pointer overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200 text-zinc-600">
                      <Layers className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-800 truncate">
                        {t?.name?.trim() || "Unnamed variant"}
                      </p>
                      <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{priceLabel(t)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </div>
                  {/* Curated-always, as in the wizard: the knobs a seller should
                      discover show even when unset. Licence is digital-only --
                      "Licence: Not set" on a boxed item would mislead rather
                      than teach. */}
                  <div className="flex flex-wrap border-t border-zinc-100">
                    <Fact k="Capacity" v={cap != null && cap > 0 ? String(cap) : "Unlimited"} />
                    {!isPhysical && (
                      <Fact
                        k="Licence"
                        v={t?.licenseTerms && String(t.licenseTerms).trim() ? "Set" : "Not set"}
                      />
                    )}
                    <Fact k="Sign-up form" v={hasForm ? "Linked" : "Not set"} />
                    <Fact
                      k="Status"
                      v={published ? "Published" : "Draft"}
                      color={published ? "#15803d" : "#a16207"}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {canEdit && (
          /* Same dashed affordance and brand-tinted hover as the wizard. Inline
             handlers rather than Tailwind variants because the brand colour is
             a CSS custom property set per community, which arbitrary variants
             cannot read at build time. */
          <button
            type="button"
            onClick={() => openTier("__new__")}
            onMouseEnter={(e) => {
              const b = "var(--brand-color, #b8336a)";
              e.currentTarget.style.color = b;
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--brand-color, #b8336a) 35%, transparent)";
              e.currentTarget.style.background =
                "color-mix(in srgb, var(--brand-color, #b8336a) 6%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "";
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.background = "";
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium text-zinc-500 border border-dashed border-zinc-200 rounded-xl cursor-pointer transition-all duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add variant
          </button>
        )}
      </div>

      {editingTier && (
        <PriceEditModal
          product={product}
          productId={productId}
          communityTag={communityTag}
          onClose={close}
          onSaved={saved}
          showToast={showToast}
          productType={productType as any}
          /* Straight to the variant's editor, skipping the modal's own list --
             the list is this page now. "__new__" appends a blank variant and
             opens it, which is what the wizard's Add does. */
          openTierLocalId={editingTier === "__new__" ? undefined : editingTier}
          openNewTier={editingTier === "__new__"}
          showMemberPricing={showMemberPricing}
        />
      )}
    </div>
  );
}
