"use client";

/**
 * ModalShell — responsive dialog shell.
 *
 * Desktop (≥ sm): a centered modal, matching the prior shared-shell layout
 * (portal to body, dim backdrop, rounded panel at the given width, body scroll
 * locked at max-height so the chrome stays put while inner steps swap).
 *
 * Mobile (< sm): a bottom sheet (drawer) — full-width, pinned to the bottom,
 * rounded top corners, a drag handle, and a slide-up entrance. The long
 * variant editor is a scrolling form, so a bottom sheet is the right mobile
 * pattern; the sheet rises to near-full height and the body scrolls inside it.
 *
 * The parent renders its own header + footer inside `children` (this shell is
 * used with hideCloseButton semantics), so the shell only provides the
 * backdrop, the panel box, and the scroll container.
 *
 * The `@cobuntu/management-ui-shared` shell is still re-exported as
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

export function ModalShell({ children, onClose, width }: ModalShellProps) {
  // SSR guard: createPortal needs document.
  if (typeof document === "undefined") return null;

  // The width applies on desktop only; on mobile the sheet is full-width. Prefix
  // any `w-` class with `sm:` so it kicks in at the modal breakpoint.
  const w = width ?? "w-[420px]";
  const smWidth = w
    .split(/\s+/)
    .map((c) => (c.startsWith("w-") ? `sm:${c}` : c))
    .join(" ");

  return createPortal(
    <>
      <style>{`@keyframes pmuiSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes pmuiModalIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center sm:p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={
            "relative bg-white text-zinc-900 flex flex-col overflow-hidden shadow-xl " +
            // Mobile: bottom sheet.
            "w-full max-h-[92dvh] rounded-t-2xl [animation:pmuiSheetUp_.24s_ease-out] " +
            // Desktop: centered modal.
            `sm:w-auto ${smWidth} sm:max-h-[90vh] sm:rounded-xl sm:[animation:pmuiModalIn_.16s_ease-out]`
          }
        >
          {/* Drag handle — mobile only. */}
          <div
            className="sm:hidden mx-auto mt-2.5 mb-0.5 h-1 w-9 shrink-0 rounded-full bg-zinc-300"
            aria-hidden="true"
          />
          {/* Scroll container — matches the shared shell so the parent's header
              and footer keep their pinned layout while the body scrolls. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
