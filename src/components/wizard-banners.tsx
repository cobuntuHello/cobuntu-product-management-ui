"use client";

import * as React from "react";
import { X } from "lucide-react";

/**
 * Decorative step banner for the create wizard (feat/wizard-presets-and-banners).
 *
 * Purely decorative — it carries no input of its own, it sits ABOVE the real
 * field/section it introduces. This package had no banner primitive at all
 * (the closest analogue, @cobuntu/event-management-ui's FormNoticeBanner, is
 * an amber warning strip, not a lead-in panel), so this is a small local
 * component rather than a cross-package dependency pulled in for one visual.
 */
export function WizardStepBanner({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-violet-50 ring-1 ring-violet-100 px-4 py-3.5">
      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-100 text-violet-600 shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-violet-900 leading-snug">{title}</p>
        <p className="text-[12.5px] text-violet-600/80 mt-0.5 leading-snug">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Dismissible tip strip ("Good to know…") for the bottom of a wizard step.
 *
 * Dismiss state is LOCAL (useState in the parent), not persisted — this
 * package has no existing persisted-dismiss pattern to hook into (checked:
 * no localStorage/db flag for any other notice here), and building one for a
 * single low-stakes tip would be a bigger change than the tip itself. The
 * tradeoff: the tip reappears on next mount (reopening the wizard, a page
 * refresh). Acceptable for a "by the way" note; revisit if sellers complain
 * about it coming back.
 *
 * Swipe-to-dismiss on mobile mirrors @cobuntu/management-ui-shared's
 * ActionModalShell (its drag-down-to-dismiss tracking), adapted from a modal
 * card to an inline strip: same touchstart/touchmove/touchend arithmetic and
 * the same 80px release threshold.
 */
export function DismissibleTipBanner({
  title = "Good to know",
  body,
  onDismiss,
}: {
  title?: string;
  body: string;
  onDismiss: () => void;
}) {
  const dragStartY = React.useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = React.useState(0);
  const SWIPE_DISMISS_PX = 80;

  function onTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0]?.clientY ?? null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const delta = (e.touches[0]?.clientY ?? 0) - dragStartY.current;
    if (delta > 0) setDragOffsetY(delta);
  }
  function onTouchEnd() {
    if (dragOffsetY > SWIPE_DISMISS_PX) onDismiss();
    setDragOffsetY(0);
    dragStartY.current = null;
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={dragOffsetY > 0
        ? { transform: `translateY(${dragOffsetY}px)`, opacity: Math.max(1 - dragOffsetY / 200, 0.4) }
        : undefined}
      className="relative flex items-start gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100 px-4 py-3.5 transition-transform"
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-200 text-zinc-500 shrink-0 mt-0.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="11" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-zinc-700">{title}</p>
        <p className="text-[12px] text-zinc-500 mt-0.5 leading-relaxed">{body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="w-7 h-7 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
      >
        <X className="h-3.5 w-3.5 text-zinc-500" />
      </button>
    </div>
  );
}
