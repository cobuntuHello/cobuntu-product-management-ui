"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { API, authHeaders, jsonHeaders, LISTING_STATUS } from "../helpers";

interface Props {
  productId: string;
  communityTag: string;
  isOpen: boolean;
  /**
   * Render INLINE rather than as a slide-over.
   *
   * This predates the tabbed manage page and was built as a drawer. When
   * Listings became a TAB, the page mounted the drawer and passed isOpen — so
   * the tab's content slid in OVER the page while the panel behind it sat
   * empty. Inline keeps the same tree and only drops the frame: no portal, no
   * overlay, no close button, none of which mean anything when the content IS
   * the panel.
   */
  inline?: boolean;
  onClose: () => void;
  onShowDetail: (listing: any) => void;
  onListingsChange: (listings: any[]) => void;
  showToast: (msg: string) => void;
  /**
   * Communities the viewer belongs to, and whether they lead each. Host-app
   * knowledge — the admin app reads it from auth, the community app from
   * membership context — so the package takes it rather than guessing.
   */
  hubs?: Array<{
    community: { communityTag: string; name: string; iconUrl?: string | null };
    roleGroups?: Array<{ isSystem?: boolean; permissions?: string[] }>;
  }>;
}

export function ListingsSection({ productId, communityTag, isOpen, onClose, onShowDetail, onListingsChange, showToast, hubs = [], inline = false }: Props) {
  // hubs arrives as a prop — see the Props type.
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleClose() { setAnimating(false); setTimeout(onClose, 300); }

  useEffect(() => { fetchListings(); }, [productId]);

  async function fetchListings() {
    if (!productId) return;
    try {
      const res = await fetch(`${API}/api/listings/product/${productId}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setListings(data);
        onListingsChange(data.filter((l: any) => l.status !== "CANCELLED"));
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }

  function handleRefresh() { fetchListings(); }

  const addedTags = new Set(listings.map((l: any) => l.community?.communityTag?.toLowerCase() || l.community?.tagLower).filter(Boolean));
  const communities = hubs.map(h => ({
    communityTag: h.community.communityTag,
    communityName: h.community.name,
    communityIconUrl: h.community.iconUrl,
    isLeader: h.roleGroups?.some((rg: any) => rg.isSystem || rg.permissions?.includes("MARKETPLACE_MANAGE_LISTINGS")) || false,
    isAlreadyAdded: addedTags.has(h.community.communityTag.toLowerCase()),
  }));
  const leaderCommunities = communities.filter(c => c.isLeader && !c.isAlreadyAdded);
  const memberCommunities = communities.filter(c => !c.isLeader && !c.isAlreadyAdded);

  async function handleLeaderAdd(c: any) {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/listings/self-list`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ productId, communityTag: c.communityTag }),
      });
      if (res.ok) { showToast("Listed in " + c.communityName); handleRefresh(); setShowAddModal(false); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || "Failed to list"); }
    } catch { showToast("Failed to list"); }
    finally { setSaving(false); }
  }

  async function handleMemberRequest(c: any) {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/listings/request`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ productId, communityTag: c.communityTag }),
      });
      if (res.ok) { showToast("Listing request sent to " + c.communityName); handleRefresh(); setShowAddModal(false); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || "Failed to request"); }
    } catch { showToast("Failed to request"); }
    finally { setSaving(false); }
  }

  function getStatusConfig(l: any) {
    if (l.status === "ACTIVE" && l.isHidden) return { label: "Hidden", dot: "bg-amber-500" };
    return LISTING_STATUS[l.status] || LISTING_STATUS.CANCELLED;
  }

  const activeListings = listings.filter(l => l.status !== "CANCELLED");

  if (!inline && !visible) return null;

  const tree = (
    <div className={inline ? "" : "fixed inset-0 z-[120]"}>
      {!inline && (
        <div className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${animating ? "opacity-100" : "opacity-0"}`} onClick={handleClose} />
      )}
      <div className={inline
        ? "flex flex-col"
        : `absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl rounded-l-2xl flex flex-col transition-transform duration-300 ease-out ${animating ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className={`flex items-center gap-3 border-b border-zinc-100 ${inline ? "pb-4" : "px-6 py-5"}`}>
          {!inline && (
          <button onClick={handleClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
              <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
            </svg>
          </button>
          )}
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-zinc-900">Listings</h2>
            <p className="text-[12px] text-zinc-400">Communities where this product is listed</p>
          </div>
          <button onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">
            Add Listing
          </button>
        </div>

        {/* Listings list */}
        <div className={inline ? "space-y-2 pt-4" : "flex-1 overflow-y-auto p-5 space-y-2"}>
        {activeListings.length > 0 ? (
          activeListings.map((l: any) => {
            const sc = getStatusConfig(l);
            const commissionRate = l.commissionRate ?? 0;
            return (
              <button key={l.id} onClick={() => onShowDetail(l)}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition-colors text-left cursor-pointer group">
                {l.community?.iconUrl ? (
                  <img src={l.community.iconUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center text-[13px] font-semibold text-zinc-500 shrink-0">
                    {l.community?.name?.[0] || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{l.community?.name || "Community"}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {commissionRate === 0 ? "Self-listed" : `${commissionRate}% commission`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 group-hover:text-zinc-400">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-10 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
            <p className="text-sm text-zinc-500">Not listed in any community yet</p>
          </div>
        )}
      </div>

      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[440px] max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100">
              <h3 className="text-[15px] font-semibold text-zinc-900">List in Community</h3>
              <p className="text-[12px] text-zinc-400 mt-0.5">Choose a community to list your product in.</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {leaderCommunities.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-5 pt-4 pb-2">Your communities</p>
                  {leaderCommunities.map(c => (
                    <button key={c.communityTag} onClick={() => handleLeaderAdd(c)} disabled={saving}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 cursor-pointer text-left disabled:opacity-50">
                      {c.communityIconUrl ? (
                        <img src={c.communityIconUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center text-[11px] font-semibold text-zinc-500">{c.communityName[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800">{c.communityName}</p>
                        <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
                          No approval needed
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {memberCommunities.length > 0 && (
                <div>
                  {leaderCommunities.length > 0 && <div className="h-px bg-zinc-100 mx-5" />}
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-5 pt-4 pb-2">Member of</p>
                  {memberCommunities.map(c => (
                    <button key={c.communityTag} onClick={() => handleMemberRequest(c)} disabled={saving}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 cursor-pointer text-left disabled:opacity-50">
                      {c.communityIconUrl ? (
                        <img src={c.communityIconUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center text-[11px] font-semibold text-zinc-500">{c.communityName[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800">{c.communityName}</p>
                        <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Requires approval
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {leaderCommunities.length === 0 && memberCommunities.length === 0 && (
                <div className="px-5 py-8 text-center"><p className="text-sm text-zinc-400">Already listed in all your communities</p></div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-zinc-100">
              <button onClick={() => setShowAddModal(false)} className="w-full px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </div>
  );

  // Inline is the tab panel itself; the drawer keeps its portal.
  return inline ? tree : createPortal(tree, document.body);
}
