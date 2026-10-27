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
  /*
   * Tinted off the COMMUNITY's own brand color (var(--brand-color), the same
   * custom property ProductForm's answered-state checkmarks already read),
   * not a fixed violet palette — a banner hardcoded to one hue looked like a
   * generic template no matter whose community it rendered in. color-mix
   * lightens/darkens the single brand color into a background tint, an
   * icon-circle tint and a readable text tint, so the banner looks native to
   * whichever brand color is set. #6d28d9 (violet-700) is the fallback for a
   * community with no brand color configured, keeping roughly today's look.
   */
  const BRAND_FALLBACK = "#27272a"; /* zinc-800 — neutral, not purple, when no brand color is set */
  const brand = `var(--brand-color, ${BRAND_FALLBACK})`;
  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        background: `color-mix(in srgb, ${brand} 8%, white)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${brand} 16%, white)`,
      }}
    >
      <span
        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
        style={{
          background: `color-mix(in srgb, ${brand} 18%, white)`,
          color: `color-mix(in srgb, ${brand} 85%, black)`,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold leading-snug" style={{ color: `color-mix(in srgb, ${brand} 70%, black)` }}>{title}</p>
        <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: `color-mix(in srgb, ${brand} 55%, black)` }}>{subtitle}</p>
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
      className="relative flex items-start gap-3 rounded-2xl bg-blue-50 ring-1 ring-blue-100 px-4 py-3.5 transition-transform"
    >
      {/* Info-blue, not gray — this is an informational note, and flat zinc
          read as a muted aside rather than "worth knowing" per feedback. */}
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600 shrink-0 mt-0.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="11" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-blue-900">{title}</p>
        <p className="text-[12px] text-blue-700/80 mt-0.5 leading-relaxed">{body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="w-7 h-7 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
      >
        <X className="h-3.5 w-3.5 text-blue-600" />
      </button>
    </div>
  );
}
