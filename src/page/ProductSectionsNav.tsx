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

export type ProductViewKey = "overview" | "details" | "collaborators" | "buyers" | "listings" | "ledger" | "activity";

/**
 * The tab strip, IN ORDER.
 *
 * SectionsNav renders `SECTIONS.filter(visible)`, so this array decides where a
 * tab sits and `visibleProductViews` decides whether it appears at all. Order
 * pinned only in that other list is pinned in the wrong place.
 */
const SECTIONS: Array<{ key: ProductViewKey; label: string }> = [
  { key: "overview", label: "Overview" },
  /*
   * Details is where the editing went.
   *
   * Overview used to BE this tab: a column of Name, Price, Category and
   * Description rows that each opened a modal, which meant opening a product
   * answered a question nobody arrived with. Overview is now a dashboard --
   * how it is doing, and whether it can be sold at all -- and the form has its
   * own place, second, because changing the thing is the second reason to be
   * here rather than the first.
   */
  { key: "details", label: "Details" },
  /*
   * LEDGER SITS AFTER DETAILS, always.
   *
   * THIS list is the one that orders the tabs -- SectionsNav renders
   * SECTIONS.filter(visible), so the allowed-views array decides WHETHER a tab
   * shows and this decides WHERE. A position pinned only in the other list is
   * pinned in the wrong place.
   */
  { key: "ledger", label: "Ledger" },
  { key: "collaborators", label: "Collaborators" },
  /*
   * Who HAS this product, and who was asked to buy it.
   *
   * Events put both on Attendees; a product had nowhere for either to live,
   * which is why giving one away and inviting somebody to buy one did not
   * exist here at all. Sits beside Collaborators because both answer "which
   * people are attached to this thing" — Collaborators is who SELLS it, this
   * is who GETS it.
   */
  { key: "buyers", label: "Buyers" },
  /*
   * "listings" is still a valid KEY -- a link or a saved URL may carry it, and
   * the host may still render that view -- but it is no longer a TAB.
   *
   * Overview shows one section per community with that listing's own views,
   * sales, earnings and terms, plus the way to ask another community to carry
   * this. A tab whose whole content is a less informative copy of the first
   * screen is a second place to look for the same answer.
   */
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

  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Map<ProductViewKey, HTMLButtonElement | null>>(new Map());
  /*
   * Which ends have more strip behind them. Drives the fades below.
   *
   * One object rather than two booleans so a scroll sets state once, and so
   * the common case -- a desktop where every tab fits and both are false --
   * settles after the first pass and stops re-rendering.
   */
  const [edges, setEdges] = React.useState({ left: false, right: false });

  function recompute() {
    const c = scrollerRef.current;
    if (!c) return;
    /*
     * The 1px slack is not superstition: scrollLeft is fractional under a
     * browser zoom or a fractional device pixel ratio, so `scrollLeft < max`
     * stays true by a quarter-pixel at the end of the strip and the right
     * fade never goes away.
     */
    const max = c.scrollWidth - c.clientWidth;
    const next = { left: c.scrollLeft > 1, right: c.scrollLeft < max - 1 };
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }

  /*
   * Put the active tab on screen before the fades are measured.
   *
   * Landing on Activity from a saved URL used to show the first three tabs and
   * the underline nowhere, which reads as a broken nav rather than a scrolled
   * one. Done by setting scrollLeft rather than scrollIntoView: that walks
   * every scrollable ancestor and would drag the page itself.
   */
  React.useLayoutEffect(() => {
    const c = scrollerRef.current;
    const node = tabRefs.current.get(activeView);
    if (c && node) {
      const left = node.offsetLeft;
      const right = left + node.offsetWidth;
      if (left < c.scrollLeft) c.scrollLeft = left - 8;
      else if (right > c.scrollLeft + c.clientWidth) c.scrollLeft = right - c.clientWidth + 8;
    }
    recompute();
  }, [activeView, visibleViews]);

  React.useEffect(() => {
    function onResize() { recompute(); }
    window.addEventListener("resize", onResize);
    const c = scrollerRef.current;
    if (c) c.addEventListener("scroll", recompute, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (c) c.removeEventListener("scroll", recompute);
    };
  }, []);

  return (
    /*
     * THE FADES LIVE OUTSIDE THE SCROLLER, THE BORDER WITH THEM.
     *
     * An overlay inside an overflow-x-auto element scrolls away with the
     * content it is supposed to be masking. So the wrapper holds the fades and
     * the bottom rule, and only the tabs scroll. The scrollbar itself is
     * hidden: a visible one on a phone is a desktop widget rendered at the
     * wrong size, and the fade is the affordance that replaces it. The event
     * page's twin.
     */
    <div className="relative -mx-1 mb-6 border-b border-zinc-200">
      <div
        ref={scrollerRef}
        className="flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((s) => {
          const active = s.key === activeView;
          return (
            <button
              key={s.key}
              ref={(el) => { tabRefs.current.set(s.key, el); }}
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

      {/*
        * The fades. Present only while there is something behind that edge,
        * which is what makes them an indicator rather than decoration -- a
        * strip that fits shows neither, so a desktop never sees them.
        *
        * They sit above the rule (bottom-px) so the border reads as one
        * unbroken line under them.
        */}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 bottom-px w-8 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 motion-reduce:transition-none ${edges.left ? "opacity-100" : "opacity-0"}`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute right-0 top-0 bottom-px w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 motion-reduce:transition-none ${edges.right ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/** The tab order, for tests that assert it without rendering the strip. */
export const SECTION_KEYS: ProductViewKey[] = SECTIONS.map((s) => s.key);
