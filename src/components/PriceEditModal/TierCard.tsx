"use client";

import * as React from "react";
import { useState } from "react";
import { Trash2, ChevronDown, GripVertical, Copy } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type MemberPricingSectionHandle } from "../MemberPricingSection";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { Collapse } from "./_primitives";
import { EditHub } from "./EditHub";

export interface TierCardProps {
  t: DraftTier & { _idx: number };
  communityTag: string;
  canRemove: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  /** Render the Member pricing card + step. Community-only. */
  showMemberPricing: boolean;
  showToast: (msg: string) => void;
  /** Imperative ref registration so the outer modal can call
   *  commit()/isDirty() on this tier's MemberPricingSection during its
   *  global Save loop. Called on mount with the handle, on unmount
   *  with null. */
  registerMemberPricingRef?: (tierId: string, handle: MemberPricingSectionHandle | null) => void;
  dragAttributes?: any;
  dragListeners?: any;
}

/**
 * Adapter that gives TierCard the dnd-kit hooks. Keeps TierCard itself
 * presentation-only.
 */
export function SortableTierRow(props: TierCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.t.localId,
  });
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
 * Tier-row card for marketplace products. Compact header (name +
 * badges + price summary + duplicate / delete) collapses/expands.
 * The expanded body delegates to EditHub, which renders the four
 * section-card landing (Basics / Options / Members / Form) and routes
 * into the step views.
 *
 * The expand/collapse state is local because product tiers don't ship
 * a `expanded` field on DraftTier (events do — historical asymmetry;
 * could be unified in a future cleanup but neither side suffers).
 */
export function TierCard({
  t,
  communityTag,
  canRemove,
  onUpdate,
  onRemove,
  onDuplicate,
  showMemberPricing,
  showToast,
  registerMemberPricingRef,
  dragAttributes,
  dragListeners,
}: TierCardProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Compact header row */}
      <div className="flex items-center gap-2 px-4 py-3">
        {dragListeners && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="p-1 -ml-2 -my-1 text-zinc-300 hover:text-zinc-600 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            {...dragAttributes}
            {...dragListeners}
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="p-1 -m-1 text-zinc-400 hover:text-zinc-700 cursor-pointer transition-colors shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        </button>
        <input
          type="text"
          value={t.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Tier name"
          className="flex-1 min-w-0 px-0 py-1 text-[14px] font-semibold text-zinc-900 placeholder:text-zinc-400 bg-transparent border-0 focus:outline-none focus:ring-0"
        />
        {/* Badges */}
        {t.hasForm && (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Form</span>
        )}
        {t.priceMode === "pwyw" && (
          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full shrink-0">PWYW</span>
        )}
        {t.isRecurring && (
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
            Recurring
          </span>
        )}
        {t.installmentEnabled && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
            Installments
          </span>
        )}
        {/* Sold count for locked tiers */}
        {locked && (
          <span className="text-[11px] font-medium text-zinc-500 tabular-nums shrink-0">
            {`${t.salesCount} sold`}
          </span>
        )}
        {/* Compact summary when collapsed */}
        {!expanded && (
          <span className="text-[13px] font-semibold text-zinc-700 tabular-nums shrink-0">
            {t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free"}
          </span>
        )}
        {t.id && (
          <button
            onClick={onDuplicate}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 cursor-pointer rounded-md hover:bg-zinc-100 transition-colors shrink-0"
            title="Duplicate tier"
            aria-label="Duplicate tier"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={locked}
            className="p-1.5 text-zinc-400 hover:text-red-500 cursor-pointer rounded-md hover:bg-red-50 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            title={locked ? "Refund all sales before deleting" : "Remove tier"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded body — delegates to EditHub. */}
      <Collapse open={expanded}>
        <EditHub
          t={t}
          communityTag={communityTag}
          onUpdate={onUpdate}
          showMemberPricing={showMemberPricing}
          registerMemberPricingRef={registerMemberPricingRef}
          showToast={showToast}
        />
      </Collapse>
    </div>
  );
}
