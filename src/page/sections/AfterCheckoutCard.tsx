"use client";

import { useEffect, useState } from "react";
import { API, authHeaders } from "../helpers";

import { useProductT } from "../../i18n/productCopy";
/**
 * "After checkout" config card (Phase 3.3) for the product manage page.
 *
 * Lets a community LEADER choose what a buyer sees after paying for this
 * community-owned product: the normal confirmation, a membership upsell to a
 * promoted tier, or a redirect to the community's own post-checkout page.
 * Only rendered when the viewer holds MARKETPLACE_CREATE (config permission) —
 * the backend re-enforces the same gate.
 */

type Mode = "NATIVE" | "MEMBERSHIP_UPSELL" | "EXTERNAL";
interface Segment { id: string; name: string }

export function AfterCheckoutCard(props: {
  communityTag: string;
  productId: string;
  initial?: {
    afterCheckoutMode?: Mode | null;
    upsellSegmentId?: string | null;
    upsellHeadline?: string | null;
    upsellCtaLabel?: string | null;
    postCheckoutUrl?: string | null;
  };
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}) {
  const tp = useProductT("marketplaceUi.productUi");
  const { communityTag, productId, initial, showToast } = props;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(initial?.afterCheckoutMode || "NATIVE");
  const [segmentId, setSegmentId] = useState<string>(initial?.upsellSegmentId || "");
  const [headline, setHeadline] = useState<string>(initial?.upsellHeadline || "");
  const [ctaLabel, setCtaLabel] = useState<string>(initial?.upsellCtaLabel || "");
  const [postCheckoutUrl, setPostCheckoutUrl] = useState<string>(initial?.postCheckoutUrl || "");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || segments.length) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/communities/${communityTag}/segments`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data?.segments || [];
          setSegments(list.map((s: any) => ({ id: s.id, name: s.name })));
        }
      } catch { /* leave empty; the picker just shows nothing */ }
    })();
  }, [open, communityTag, segments.length]);

  const summary =
    mode === "MEMBERSHIP_UPSELL"
      ? tp("afterCheckoutCard.membershipUpsell", { value: segments.find((s) => s.id === segmentId)?.name ? " · " + segments.find((s) => s.id === segmentId)!.name : "" })
      : mode === "EXTERNAL"
        ? tp("common.externalRedirect")
        : tp("common.normalConfirmation");

  async function save() {
    if (mode === "MEMBERSHIP_UPSELL" && !segmentId) { showToast(tp("afterCheckoutCard.chooseAMembershipTierTo"), "error"); return; }
    if (mode === "EXTERNAL" && !/^https:\/\/[^\s]+$/.test(postCheckoutUrl.trim())) { showToast(tp("afterCheckoutCard.enterAValidHttpsUrl"), "error"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/communities/${communityTag}/products/${productId}/after-checkout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          afterCheckoutMode: mode,
          upsellSegmentId: mode === "MEMBERSHIP_UPSELL" ? segmentId : null,
          upsellHeadline: mode === "MEMBERSHIP_UPSELL" ? headline || null : null,
          upsellCtaLabel: mode === "MEMBERSHIP_UPSELL" ? ctaLabel || null : null,
          postCheckoutUrl: mode === "EXTERNAL" ? postCheckoutUrl.trim() : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save");
      }
      showToast(tp("afterCheckoutCard.afterCheckoutUpdated"), "success");
      setOpen(false);
    } catch (e: any) {
      showToast(e?.message || tp("common.failedToSave"), "error");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400";

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-lg border border-zinc-200 bg-white flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400" aria-hidden>
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{tp("common.afterCheckout")}</p>
            <p className="text-[13px] text-zinc-500 leading-snug mt-0.5">
              {tp("afterCheckoutCard.whatBuyersSeeAfterPaying")} <span className="font-medium text-zinc-700">{summary}</span>
            </p>
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer">
            {tp("afterCheckoutCard.configure")}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { v: "NATIVE", label: tp("common.normalConfirmation") },
              { v: "MEMBERSHIP_UPSELL", label: tp("common.membershipUpsell") },
              { v: "EXTERNAL", label: tp("common.externalRedirect") },
            ] as const).map((opt) => (
              <button key={opt.v} type="button" onClick={() => setMode(opt.v)}
                className={`rounded-lg border px-3 py-2 text-[13px] text-left transition-colors cursor-pointer ${mode === opt.v ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
                {opt.label}
              </button>
            ))}
          </div>

          {mode === "MEMBERSHIP_UPSELL" && (
            <div className="space-y-2">
              <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className={inputCls}>
                <option value="">{tp("afterCheckoutCard.chooseAMembershipTierTo2")}</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={tp("afterCheckoutCard.headlineOptional")} maxLength={140} className={inputCls} />
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder={tp("afterCheckoutCard.buttonLabelOptional")} maxLength={40} className={inputCls} />
            </div>
          )}

          {mode === "EXTERNAL" && (
            <input value={postCheckoutUrl} onChange={(e) => setPostCheckoutUrl(e.target.value)} placeholder="https://your-site.com/thank-you" className={inputCls} />
          )}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={saving} onClick={save}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer">
              {saving ? tp("common.saving") : tp("common.save")}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer">
              {tp("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
