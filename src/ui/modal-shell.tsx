"use client";

/**
 * ModalShell — responsive dialog shell.
 *
 * Desktop (≥ sm): a centered modal (portal to body, dim backdrop, rounded panel
 * at the given width, body scroll locked at max-height so the chrome stays put
 * while inner steps swap).
 *
 * Mobile (< sm): a bottom sheet (drawer) — full-width, pinned to the bottom,
 * rounded top corners, a drag handle, a slide-up entrance, near-full height with
 * the body scrolling inside. The handle is a real grab target: swipe it down to
 * dismiss (past a threshold it closes; otherwise it snaps back). Tapping the
 * scrim also dismisses.
 *
 * The parent renders its own header + footer inside `children`, so the shell
 * provides the backdrop, the panel box, and the scroll container.
 *
 * `@cobuntu/management-ui-shared`'s shell is still re-exported as
 * `SharedModalShell` for the slot-based call-sites that use it directly.
 */

import * as React from "react";
import { createPortal } from "react-dom";

export {
  ModalShell as SharedModalShell,
  type ModalShellProps as SharedModalShellProps,
} from "@cobuntu/management-ui-shared";

export interface ModalShellProps {
  children: React.ReactNode;
  onClose: () => void;
  /** Desktop panel width (Tailwind class, e.g. "w-[600px]"). Full-width on mobile. */
  width?: string;
}

/** How far the sheet must be dragged down before releasing closes it. */
const DISMISS_THRESHOLD = 110;

export function ModalShell({ children, onClose, width }: ModalShellProps) {
  // Hooks run unconditionally (before the SSR guard) to satisfy rules-of-hooks.
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const startY = React.useRef<number | null>(null);

  // SSR guard: createPortal needs document.
  if (typeof document === "undefined") return null;

  const w = width ?? "w-[420px]";
  // Desktop panel width via a REAL media query, not a Tailwind class.
  //
  // The old code turned the `width` prop ("w-[600px]") into "sm:w-[600px]" at
  // RUNTIME — a class Tailwind's scanner never sees, so unless an app happened
  // to generate it (community's bare `@source ".../src"` did; the admin's
  // globbed `@source` did not), it had no CSS and the panel fell back to w-full.
  // That is why the admin app's variant modal rendered near full-viewport while
  // the community app's was 600px. Parse the VALUE and emit a scoped rule that
  // always exists, independent of any app's Tailwind config. The doubled class
  // in the selector lifts specificity above Tailwind's `sm:w-auto` without
  // `!important`.
  const widthValue = /w-\[([^\]]+)\]/.exec(w)?.[1] ?? "420px";
  const widthClass = `pmui-mw-${widthValue.replace(/[^a-z0-9]/gi, "")}`;

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? null;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? startY.current) - startY.current;
    setDragY(dy > 0 ? dy : 0); // downward only
  };
  const onTouchEnd = () => {
    setDragging(false);
    startY.current = null;
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
      return;
    }
    setDragY(0); // snap back
  };

  return createPortal(
    <>
      <style>{`@keyframes pmuiSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes pmuiModalIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@media(min-width:640px){.${widthClass}.${widthClass}{width:${widthValue}}}.pmui-modal-scroll{scrollbar-width:none;-ms-overflow-style:none}.pmui-modal-scroll::-webkit-scrollbar{display:none}`}</style>
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center sm:p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={
            dragY > 0
              ? { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform .2s ease-out" }
              : undefined
          }
          className={
            "relative bg-white text-zinc-900 flex flex-col overflow-hidden shadow-xl " +
            "w-full max-h-[92dvh] rounded-t-2xl [animation:pmuiSheetUp_.24s_ease-out] " +
            `sm:w-auto ${widthClass} sm:max-h-[90vh] sm:rounded-xl sm:[animation:pmuiModalIn_.16s_ease-out]`
          }
        >
          {/* Drag handle — mobile only. A real grab target: swipe down to close.
              `touch-none` stops the browser from scrolling/pull-to-refresh while
              the finger is on the handle. */}
          <div
            className="sm:hidden shrink-0 flex justify-center pt-2.5 pb-1.5 touch-none cursor-grab active:cursor-grabbing"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            aria-hidden="true"
          >
            <div className="h-1 w-9 rounded-full bg-zinc-300" />
          </div>
          {/* Scroll container — matches the shared shell so the parent's header
              and footer keep their pinned layout while the body scrolls. */}
          <div className="pmui-modal-scroll flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
