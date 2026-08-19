"use client";

import * as React from "react";

/**
 * The product manage page's header — breadcrumbs, identity, Back and Preview.
 *
 * A deliberate clone of EventManageHeader down to the sizes and colours,
 * because the two pages sit one nav item apart and reading as different
 * products is the failure mode. Only the leading icon differs: a tag rather
 * than a calendar.
 *
 * It used to be a SLOT, so each app supplied its own, and they diverged
 * exactly as the event ones did: chevrons and icon buttons on one side, a "/"
 * separator and plain text on the other. The slot still exists for something
 * genuinely app-specific, but this is the default, so "consistent unless
 * someone opts out" replaces "consistent until someone forgets".
 *
 * The ROUTES stay injected. Back goes to /:tag/marketplace in the admin app
 * and /marketplace in the community app, and Preview opens an absolute URL
 * from one and a relative one from the other — a hardcoded
 * <tag>.cobuntu.com is what broke preview on custom domains.
 */

export interface ProductManageHeaderProps {
  breadcrumbs: Array<{ label: string; onClick?: () => void }>;
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel: string;
  onPreview: () => void;
  previewLabel: string;
}

const TagIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

export function ProductManageHeader({
  breadcrumbs,
  title,
  subtitle,
  onBack,
  backLabel,
  onPreview,
  previewLabel,
}: ProductManageHeaderProps) {
  return (
    <div className="mb-8">
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 text-[13px] mb-5">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              {crumb.onClick ? (
                <button onClick={crumb.onClick} className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
                  {crumb.label}
                </button>
              ) : (
                <span className="text-zinc-700 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/*
        * ON A PHONE THE TITLE GETS THE ROW TO ITSELF.
        *
        * Back and Preview sat beside it at every width, so a name of any real
        * length was truncated to make room for two controls that are not what
        * you came to read -- "Test Product - Mem..." beside a button you could
        * have reached anyway. The actions drop below and go full-width, which
        * also puts them in thumb reach instead of the top corner.
        */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="flex items-start gap-3">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl shrink-0 flex items-center justify-center bg-zinc-100 text-zinc-500">
          <TagIcon />
        </div>
        <div className="flex-1 min-w-0">
          {/*
            * Wraps on a phone, truncates from md up where the actions return to
            * the same row and the space is genuinely contested.
            */}
          <h1 className="text-xl font-semibold text-zinc-900 md:truncate">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
        </div>

        <div className="flex items-center gap-2 md:shrink-0 md:ml-auto [&>*]:flex-1 md:[&>*]:flex-none">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 cursor-pointer"
            title={backLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {backLabel}
          </button>
          <button
            onClick={onPreview}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {previewLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
