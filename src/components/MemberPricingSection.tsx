"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useProductManagementConfig, useJsonHeaders } from "../config";

/**
 * Member-pricing editor for a single (community-owned) marketplace
 * product tier.
 *
 * Renders one row per community segment, each with an enable toggle +
 * mode dropdown (FREE / PERCENT_OFF / FLAT_OFF / FIXED_PRICE) + value
 * + priority. For RECURRING tiers it also exposes `recurringScope`
 * (ALWAYS vs FIRST_ONLY) — i.e. does the discount apply to every
 * renewal, or only the first invoice. For one-time tiers the field
 * is hidden (it would never matter).
 *
 * Backend endpoints (shipped in PR mp-04):
 *   GET    /communities/:tag/tiers/:tierId/member-pricing
 *   POST   /communities/:tag/tiers/:tierId/member-pricing      (upsert by tierId+segmentId)
 *   PUT    /communities/:tag/tiers/:tierId/member-pricing/:id
 *   DELETE /communities/:tag/tiers/:tierId/member-pricing/:id
 *
 * Community-only. The parent PriceEditModal only mounts this when the
 * `showMemberPricing` prop is true (admin passes true; community-app
 * `/manage` omits / passes false — user-owned products don't get the
 * section).
 *
 * Self-contained: this component fetches its own data, manages its own
 * dirty state, and saves via its own button. Keeps the outer modal's
 * save loop untouched.
 */

interface CommunitySegment {
  id: string;
  name: string;
  color?: string | null;
}

type Mode = "FREE" | "PERCENT_OFF" | "FLAT_OFF" | "FIXED_PRICE";
type RecurringScope = "ALWAYS" | "FIRST_ONLY";

interface MemberPricingRow {
  id?: string;
  segmentId: string;
  segmentName: string;
  enabled: boolean;
  mode: Mode;
  /** Display-string. Mode-dependent: FREE ignores it, PERCENT_OFF is
   *  1–100, FLAT_OFF / FIXED_PRICE are display-unit (e.g. "10" = €10). */
  value: string;
  priority: string;
  recurringScope: RecurringScope;
  initial?: {
    enabled: boolean;
    mode: Mode;
    value: string;
    priority: string;
    recurringScope: RecurringScope;
    id?: string;
  };
}

export interface MemberPricingSectionProps {
  communityTag: string;
  /** Tier id (saved tiers only — caller hides the section for unsaved
   *  drafts since the backend needs a real id). */
  tierId: string;
  currencySymbol: string;
  currencyCode: string;
  /** When true, expose recurringScope (ALWAYS vs FIRST_ONLY) on each
   *  row. Hidden for one-time tiers — the field would never matter. */
  isRecurringTier: boolean;
  showToast: (msg: string) => void;
}

function toSmallestUnit(majorAmount: number, currency: string): number {
  return currency === "JPY" ? Math.round(majorAmount) : Math.round(majorAmount * 100);
}

function fromSmallestUnit(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "";
  return String(currency === "JPY" ? amount : amount / 100);
}

export function MemberPricingSection({
  communityTag, tierId, currencySymbol, currencyCode, isRecurringTier, showToast,
}: MemberPricingSectionProps) {
  const { apiBaseUrl, authHeaders } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MemberPricingRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [segRes, ovRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/communities/${communityTag}/segments`, { headers: authHeaders() }),
          fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`, { headers: authHeaders() }),
        ]);
        if (!segRes.ok) throw new Error("Could not load community segments.");
        const segments: CommunitySegment[] = await segRes.json();
        const overrides: any[] = ovRes.ok ? await ovRes.json() : [];

        const byId = new Map<string, any>(overrides.map(o => [o.segmentId, o]));
        const built: MemberPricingRow[] = segments.map(s => {
          const o = byId.get(s.id);
          const valueRaw: string = o
            ? (o.mode === "FLAT_OFF" || o.mode === "FIXED_PRICE")
              ? fromSmallestUnit(o.value, currencyCode)
              : String(o.value ?? "")
            : "";
          const initial = {
            enabled: !!o,
            mode: (o?.mode as Mode) ?? "PERCENT_OFF",
            value: valueRaw,
            priority: String(o?.priority ?? "0"),
            recurringScope: (o?.recurringScope as RecurringScope) ?? "ALWAYS",
            id: o?.id,
          };
          return {
            id: o?.id,
            segmentId: s.id,
            segmentName: s.name,
            enabled: initial.enabled,
            mode: initial.mode,
            value: initial.value,
            priority: initial.priority,
            recurringScope: initial.recurringScope,
            initial,
          };
        });
        setRows(built);
      } catch (e: any) {
        setError(e.message || "Failed to load member pricing");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag, tierId, apiBaseUrl]);

  function updateRow(idx: number, patch: Partial<MemberPricingRow>) {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function rowIsDirty(r: MemberPricingRow): boolean {
    if (!r.initial) return r.enabled;
    return r.enabled !== r.initial.enabled
      || r.mode !== r.initial.mode
      || r.value.trim() !== r.initial.value.trim()
      || r.priority.trim() !== r.initial.priority.trim()
      || r.recurringScope !== r.initial.recurringScope;
  }

  function validateRow(r: MemberPricingRow): string | null {
    if (!r.enabled) return null;
    if (r.mode === "FREE") return null;
    const v = parseFloat(r.value);
    if (isNaN(v) || v < 0) return `${r.segmentName}: value must be a non-negative number.`;
    if (r.mode === "PERCENT_OFF" && (v < 1 || v > 100)) {
      return `${r.segmentName}: percent off must be between 1 and 100.`;
    }
    return null;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const r of rows) {
        const err = validateRow(r);
        if (err) throw new Error(err);
      }

      for (const r of rows) {
        if (!rowIsDirty(r)) continue;

        if (r.initial?.enabled && !r.enabled && r.initial.id) {
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing/${r.initial.id}`, {
            method: "DELETE", headers: authHeaders(),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || `Failed to remove override for ${r.segmentName}`);
          }
          continue;
        }

        if (r.enabled) {
          let backendValue = 0;
          if (r.mode === "PERCENT_OFF") {
            backendValue = parseInt(r.value, 10);
          } else if (r.mode === "FLAT_OFF" || r.mode === "FIXED_PRICE") {
            backendValue = toSmallestUnit(parseFloat(r.value), currencyCode);
          }
          const body: any = {
            segmentId: r.segmentId,
            mode: r.mode,
            value: backendValue,
            priority: parseInt(r.priority || "0", 10) || 0,
          };
          // recurringScope only meaningful for recurring tiers. Backend
          // accepts the field on any row but stores it; we omit on
          // one-time tiers to keep payloads small + the row's UI
          // consistent with what's saved.
          if (isRecurringTier) {
            body.recurringScope = r.recurringScope;
          }
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`, {
            method: "POST", headers: jsonHeaders(), body: JSON.stringify(body),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || `Failed to save override for ${r.segmentName}`);
          }
          const saved = await res.json().catch(() => null);
          if (saved?.id) updateRow(rows.indexOf(r), { id: saved.id });
        }
      }

      setRows(rs => rs.map(r => ({
        ...r,
        initial: {
          enabled: r.enabled,
          mode: r.mode,
          value: r.value,
          priority: r.priority,
          recurringScope: r.recurringScope,
          id: r.id ?? r.initial?.id,
        },
      })));
      showToast("Member pricing updated");
    } catch (e: any) {
      setError(e.message || "Failed to save member pricing");
    } finally {
      setSaving(false);
    }
  }

  const dirtyCount = rows.filter(rowIsDirty).length;

  if (loading) {
    return (
      <div className="pt-2 border-t border-zinc-100">
        <p className="text-[11px] text-zinc-400">Loading member pricing…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="pt-2 border-t border-zinc-100">
        <p className="text-[12px] font-medium text-zinc-700">Member pricing</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          No segments configured yet. Create a community segment first to offer member-only pricing on this tier.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-zinc-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-zinc-700">Member pricing</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Discount this tier for buyers in specific community segments.
          </p>
        </div>
        {dirtyCount > 0 && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-[11px] font-semibold px-3 py-1.5 bg-zinc-900 text-white rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : `Save (${dirtyCount})`}
          </button>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-red-600 mt-1.5">{error}</p>
      )}
      <div className="mt-2 space-y-2">
        {rows.map((r, idx) => (
          <div key={r.segmentId} className="px-2 py-1.5 rounded bg-zinc-50/60 border border-zinc-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={e => updateRow(idx, { enabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              />
              <span className="text-[12px] font-medium text-zinc-700">{r.segmentName}</span>
              {r.enabled && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 ml-auto">
                  {r.mode.replace(/_/g, " ").toLowerCase()}
                </span>
              )}
            </label>
            {r.enabled && (
              <>
                <div className={`grid ${isRecurringTier ? "grid-cols-[1fr_110px_70px_120px]" : "grid-cols-[1fr_120px_80px]"} gap-2 mt-2`}>
                  <Select value={r.mode} onValueChange={v => updateRow(idx, { mode: v as Mode })}>
                    <SelectTrigger className="h-[30px] text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FREE">Free</SelectItem>
                      <SelectItem value="PERCENT_OFF">% off</SelectItem>
                      <SelectItem value="FLAT_OFF">Flat off</SelectItem>
                      <SelectItem value="FIXED_PRICE">Fixed price</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="number" min="0" step={r.mode === "PERCENT_OFF" ? "1" : "0.01"}
                    value={r.value}
                    onChange={e => updateRow(idx, { value: e.target.value })}
                    placeholder={
                      r.mode === "PERCENT_OFF" ? "20" :
                      r.mode === "FREE" ? "—" :
                      `${currencySymbol}10`
                    }
                    disabled={r.mode === "FREE"}
                    className="px-2.5 py-1.5 text-[12px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <input
                    type="number" step="1" value={r.priority}
                    onChange={e => updateRow(idx, { priority: e.target.value })}
                    placeholder="0"
                    title="Higher priority wins when a buyer is in multiple matching segments"
                    className="px-2.5 py-1.5 text-[12px] text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {isRecurringTier && (
                    <Select value={r.recurringScope} onValueChange={v => updateRow(idx, { recurringScope: v as RecurringScope })}>
                      <SelectTrigger className="h-[30px] text-[12px]" title="Apply discount to every renewal (Always) or only the first invoice (First only)"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALWAYS">Always</SelectItem>
                        <SelectItem value="FIRST_ONLY">First only</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
