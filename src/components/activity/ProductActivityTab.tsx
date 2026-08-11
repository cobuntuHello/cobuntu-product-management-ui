"use client";

import * as React from "react";
import { useProductManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import {
  renderProductActivitySentence,
  formatRelativeTime,
  type ProductActivityEntryForRender,
} from "./productActivitySentences";

/**
 * Activity tab on the product manage page — reverse-chronological feed of
 * every manager-visible action on the product, paged through
 * GET /api/communities/:tag/products/:productId/activity.
 *
 * Structurally the event tab: one row per entry (actor avatar + sentence +
 * relative time), first page on mount, infinite scroll via an
 * IntersectionObserver sentinel, a single retry block on error.
 *
 * ACCESS. The endpoint answers 404 — not 403 — for a viewer who cannot manage
 * the product, because 403 would confirm it exists. That means "not found"
 * here is ambiguous by design, so the copy says the log is unavailable rather
 * than asserting the product is gone.
 */

export interface ProductActivityTabProps {
  /** Id or sku — the BE controller resolves either. */
  product: { id: string; sku?: string | null };
  /** Community tag of the manage page hosting this tab. */
  communityTag: string;
  /** Initial page size. 25 fits a phone viewport; scroll fills the rest. */
  pageSize?: number;
}

interface ActivityEntry {
  id: string;
  source: "PRODUCT_AUDIT" | "COLLABORATOR_AUDIT";
  action: string;
  createdAt: string;
  actor: { id: string; name: string | null; usertag: string | null; profileImage: string | null } | null;
  payload: Record<string, unknown> | null;
}

export function ProductActivityTab({ product, communityTag, pageSize = 25 }: ProductActivityTabProps) {
  const config = useProductManagementConfig();
  const API = config.apiBaseUrl;
  const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

  const [entries, setEntries] = React.useState<ActivityEntry[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // One timer for the whole list rather than one per row: "2m ago" stays
  // honest without N intervals on a feed that can run to hundreds of rows.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const productRef = product.id || product.sku || "";

  // A ref, not the `loading` state, guards re-entry: the observer and the
  // mount effect can both fire within one render pass, and a state read
  // there is a render behind.
  const inFlight = React.useRef(false);

  const loadPage = React.useCallback(
    async (pageCursor: string | null) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        /*
         * Built as a STRING, not with `new URL()`.
         *
         * The community app passes apiBaseUrl: "" — its API is same-origin, so
         * the session cookie rides along and no Bearer is read from JS. `new
         * URL("/api/...")` with no base throws "Failed to construct 'URL':
         * Invalid URL", so the tab rendered an error instead of the log for
         * every seller on that app. URLSearchParams still handles the encoding;
         * only the base-resolution is dropped, and that is the part that
         * assumed an absolute origin.
         */
        const qs = new URLSearchParams({ limit: String(pageSize) });
        if (pageCursor) qs.set("cursor", pageCursor);
        const res = await fetch(
          `${API}/api/communities/${communityTag}/products/${productRef}/activity?${qs.toString()}`,
          { headers: config.authHeaders() },
        );
        if (!res.ok) {
          if (res.status === 401) throw new Error("Sign in to view this product's activity.");
          // 404 covers both "no such product" and "not yours" — see the
          // header note. Claiming it does not exist would be a guess.
          if (res.status === 404) throw new Error("This product's activity isn't available.");
          throw new Error(`Couldn't load activity (${res.status})`);
        }
        const data = (await res.json()) as { entries: ActivityEntry[]; nextCursor: string | null };
        setEntries((prev) => {
          if (!pageCursor) return data.entries;
          // Belt and braces on top of the BE's own de-dup: a double-fired
          // observer would otherwise render duplicate React keys, and a key
          // collision is a much louder failure than a missing row.
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...data.entries.filter((e) => !seen.has(e.id))];
        });
        setCursor(data.nextCursor);
        if (!data.nextCursor) setExhausted(true);
      } catch (err: any) {
        setError(err?.message ?? "Couldn't load activity");
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [API, communityTag, productRef, pageSize, config],
  );

  React.useEffect(() => {
    setEntries([]);
    setCursor(null);
    setExhausted(false);
    setError(null);
    void loadPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRef, communityTag]);

  React.useEffect(() => {
    if (exhausted || loading || error || !cursor) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (obs) => { if (obs.some((e) => e.isIntersecting)) void loadPage(cursor); },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, exhausted, loading, error, loadPage]);

  return (
    /* Full width, like the other tabs. max-w-2xl made Activity a narrow
       column under a full-width tab row — the only tab that did not line up
       with its own header. */
    <section>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-zinc-900">Activity</h2>
        <p className="text-[12px] text-zinc-400 mt-0.5">
          Every meaningful change to this product. Newest first.
        </p>
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
        {entries.length === 0 && !loading && !error ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} now={now} UserAvatar={UserAvatar} />
            ))}
          </ul>
        )}

        {loading && <LoadingRow />}

        {error && (
          <div className="px-6 py-6 text-center">
            <p className="text-[13px] text-red-600 mb-2">{error}</p>
            <button
              type="button"
              onClick={() => void loadPage(cursor)}
              className="px-3 py-1.5 text-[12px] font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {cursor && !exhausted && !error && <div ref={sentinelRef} className="h-6" aria-hidden />}

        {exhausted && entries.length > 0 && (
          <p className="px-6 py-4 text-center text-[11px] text-zinc-400">End of activity.</p>
        )}
      </div>
    </section>
  );
}

type AvatarComponent = React.ComponentType<{
  user: {
    name?: string | null;
    imageUrl?: string | null;
    profileImage?: string | null;
    usertag?: string | null;
    email?: string | null;
    id?: string | null;
  };
  className?: string;
}>;

function ActivityRow({
  entry,
  now,
  UserAvatar,
}: {
  entry: ActivityEntry;
  now: Date;
  UserAvatar: AvatarComponent;
}) {
  const sentence = renderProductActivitySentence(entry as ProductActivityEntryForRender);
  const exactTime = React.useMemo(() => {
    const d = new Date(entry.createdAt);
    return Number.isNaN(d.getTime()) ? entry.createdAt : d.toLocaleString();
  }, [entry.createdAt]);

  return (
    <li className="flex items-start gap-3 px-4 sm:px-6 py-3">
      <UserAvatar
        user={{
          id: entry.actor?.id ?? null,
          name: entry.actor?.name ?? null,
          usertag: entry.actor?.usertag ?? null,
          profileImage: entry.actor?.profileImage ?? null,
        }}
        className="w-8 h-8 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-zinc-800 leading-snug">{sentence.text}</p>
        {/* The relative label is scannable; the exact instant is what someone
            reconciling against a Stripe event or a support thread needs. */}
        <p className="text-[11px] text-zinc-400 mt-0.5" title={exactTime}>
          {formatRelativeTime(entry.createdAt, now)}
        </p>
      </div>
    </li>
  );
}

function LoadingRow() {
  return (
    <div className="px-6 py-4 flex items-center gap-3" aria-busy="true">
      <div className="w-8 h-8 rounded-full bg-zinc-100 animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-3/4 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-1/3 rounded bg-zinc-100/70 animate-pulse" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-12 text-center">
      <svg
        width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5"
        className="mx-auto text-zinc-200 mb-3" aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <p className="text-sm text-zinc-500">No activity yet</p>
      <p className="text-xs text-zinc-400 mt-1">
        Edits, listing decisions, and co-seller changes will show up here.
      </p>
    </div>
  );
}
