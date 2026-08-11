"use client";

import * as React from "react";

/**
 * The product manage tabs.
 *
 * Modelled on the event page's SectionsNav rather than invented: same
 * underline treatment, same sizes, same active colours. The admin app's
 * product nav was ROUTE-based (Overview at the base path, Listings at
 * /manage-listings), which is why it could never grow a tab that has no page
 * of its own. This is view-state, like events, so tabs are cheap to add.
 */

export type ProductViewKey = "overview" | "collaborators" | "listings" | "activity";

const SECTIONS: Array<{ key: ProductViewKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "collaborators", label: "Collaborators" },
  { key: "listings", label: "Listings" },
  // Activity landed with feat/product-audits (product_audits + the
  // /activity endpoint), so the tab this file used to say could not exist
  // now can. It is last on purpose: it answers questions about the other
  // three rather than being somewhere work starts.
  { key: "activity", label: "Activity" },
];

export function ProductSectionsNav({
  activeView,
  onViewChange,
  visibleViews,
}: {
  activeView: ProductViewKey;
  onViewChange: (v: ProductViewKey) => void;
  /** Omitted = all. Filtered for viewers who cannot use a given surface. */
  visibleViews?: readonly ProductViewKey[];
}) {
  const shown = SECTIONS.filter((s) => !visibleViews || visibleViews.includes(s.key));

  return (
    <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 mb-6 border-b border-zinc-200">
      {shown.map((s) => {
        const active = s.key === activeView;
        return (
          <button
            key={s.key}
            onClick={() => onViewChange(s.key)}
            className={`inline-flex items-center px-3 py-3 text-[14px] whitespace-nowrap cursor-pointer transition-colors border-b-2 -mb-px ${
              active
                ? "text-zinc-900 font-medium border-zinc-900"
                : "text-zinc-400 hover:text-zinc-700 border-transparent"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
