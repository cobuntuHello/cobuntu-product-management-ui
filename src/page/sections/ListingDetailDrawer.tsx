"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { API, authHeaders, jsonHeaders, LISTING_STATUS } from "../helpers";

/**
 * Resolve the community-app URL where the listing conversation lives.
 * Admin runs at `admin.<community-host>` in prod; strip the leading
 * `admin.` subdomain to get the consumer host. Local dev (port-based)
 * falls back to NEXT_PUBLIC_COMMUNITY_APP_URL — the env var wins
 * when set so dev/staging overrides work.
 */
function communityAppUrlFromAdminHost(communityTag: string): string {
  const envOverride = process.env.NEXT_PUBLIC_COMMUNITY_APP_URL;
  if (envOverride) return envOverride.replace(/\/$/, "");
  if (typeof window === "undefined") return `https://${communityTag}.cobuntu.com`;
  const host = window.location.host;
  const stripped = host.startsWith("admin.") ? host.slice("admin.".length) : host;
  return `${window.location.protocol}//${stripped}`;
}

interface Props {
  listing: any;
  communityTag: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function ListingDetailDrawer({ listing, communityTag, onClose, onRefresh }: Props) {
  const [stats, setStats] = useState<{ views: number; sales: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (listing) {
      setVisible(true);
      fetchStats();
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [listing?.id]);

  function handleClose() { setAnimating(false); setTimeout(onClose, 300); }

  async function fetchStats() {
    if (!listing?.id) return;
    setLoadingStats(true);
    try {
      const res = await fetch(`${API}/api/listings/${listing.id}/stats`, { headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch { /* */ }
    finally { setLoadingStats(false); }
  }

  async function updateStatus(status: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/listings/${listing.id}/status`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) onRefresh();
    } catch { /* */ }
    finally { setActionLoading(false); }
  }

  async function toggleVisibility() {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/listings/${listing.id}/visibility`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ isHidden: !listing.isHidden }),
      });
      if (res.ok) onRefresh();
    } catch { /* */ }
    finally { setActionLoading(false); }
  }

  /**
   * Phase 2d — Open conversation. POSTs to the messaging-service
   * find-or-create endpoint then deep-links to the community-app
   * `/conversations/<id>` in a new tab. The endpoint is idempotent on
   * (communityListingId), so re-clicking the button always lands the
   * leader in the same chat.
   *
   * The COMMUNITY_APP_URL fallback assumes a sibling deploy on the
   * same root domain (admin lives at admin.<community>.com, community
   * app at <community>.com). If the env var is set we honour it;
   * otherwise build from the current hostname by stripping the leading
   * `admin.` subdomain.
   */
  async function openConversation() {
    if (!listing?.id) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API}/api/messaging/conversations/listings/${listing.id}/open`,
        { method: "POST", headers: jsonHeaders() },
      );
      if (!res.ok) {
        console.warn("Failed to open listing conversation:", await res.text());
        return;
      }
      const { conversation } = await res.json();
      const communityAppUrl = communityAppUrlFromAdminHost(communityTag);
      window.open(`${communityAppUrl}/conversations/${conversation.id}`, "_blank", "noopener");
    } catch (err) {
      console.warn("Open conversation failed:", err);
    } finally {
      setActionLoading(false);
    }
  }

  const sc = listing ? (LISTING_STATUS[listing.status] || LISTING_STATUS.CANCELLED) : null;
  const commissionRate = listing?.commissionRate ?? listing?.productListing?.commissionRate ?? 0;

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${animating ? "opacity-100" : "opacity-0"}`} onClick={handleClose} />
      <div className={`absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl rounded-l-2xl flex flex-col transition-transform duration-300 ease-out ${animating ? "translate-x-0" : "translate-x-full"}`}>
        {listing && (
          <div className="h-full flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-zinc-100">
              <button onClick={handleClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
                </svg>
              </button>
              {listing.community?.iconUrl ? (
                <img src={listing.community.iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-[14px] font-semibold text-zinc-500 shrink-0">
                  {listing.community?.name?.[0] || "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-zinc-900 truncate">{listing.community?.name || "Community"}</p>
                <p className="text-[12px] text-zinc-400">{listing.community?.communityTag || communityTag}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{loadingStats ? "-" : (stats?.views ?? 0)}</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Views</p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{loadingStats ? "-" : (stats?.sales ?? 0)}</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Sales</p>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="px-6 py-4 border-t border-zinc-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-500">Status</span>
                <span className="flex items-center gap-1.5 text-[13px] text-zinc-700">
                  <span className={`w-1.5 h-1.5 rounded-full ${sc?.dot}`} />
                  {sc?.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-500">Commission</span>
                <span className="text-[13px] text-zinc-700">
                  {commissionRate === 0 ? "Self-listed (0%)" : `${commissionRate}%`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-500">Visibility</span>
                <span className="text-[13px] text-zinc-700">
                  {listing.isHidden ? "Hidden" : "Visible"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-500">Created</span>
                <span className="text-[13px] text-zinc-700">
                  {new Date(listing.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-zinc-100 space-y-2 mt-auto">
              {/* Phase 2d — open the per-listing chat in the community
                  app. Always shown (any non-cancelled listing can have
                  its conversation surfaced); the messaging endpoint is
                  idempotent + auto-creates on first click. */}
              {listing.status !== "CANCELLED" && (
                <button onClick={openConversation} disabled={actionLoading}
                  className="w-full px-4 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Open conversation
                </button>
              )}
              {listing.status === "ACTIVE" && (
                <button onClick={() => updateStatus("PAUSED")} disabled={actionLoading}
                  className="w-full px-4 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer disabled:opacity-40">
                  Pause
                </button>
              )}
              {listing.status === "PAUSED" && (
                <button onClick={() => updateStatus("ACTIVE")} disabled={actionLoading}
                  className="w-full px-4 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer disabled:opacity-40">
                  Resume
                </button>
              )}
              <button onClick={toggleVisibility} disabled={actionLoading}
                className="w-full px-4 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer disabled:opacity-40">
                {listing.isHidden ? "Show" : "Hide"}
              </button>
              <button onClick={() => updateStatus("CANCELLED")} disabled={actionLoading}
                className="w-full px-4 py-2.5 text-[13px] font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer disabled:opacity-40">
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
