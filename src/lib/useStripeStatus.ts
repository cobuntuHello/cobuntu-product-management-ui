"use client";

import { useEffect, useState } from "react";
import { useProductManagementConfig, type ProductManagementConfig } from "../config";

/**
 * Minimal local mirror of @cobuntu/event-management-ui's useStripeStatus
 * (src/components/stripe-status.tsx), for the pricing-step "Paid" preset
 * card (feat/wizard-presets-and-banners).
 *
 * ── Why a local copy, not a dependency on event-management-ui ─────────────
 *
 * This package (product-management-ui) does not depend on
 * @cobuntu/event-management-ui today, and the two are siblings, not one
 * depending on the other (product/event management-ui both sit beside each
 * other, consumed independently by the two apps). Adding a cross-package
 * dependency for one hook is a heavier, longer-lived change than copying ~30
 * lines that mirror a proven implementation — the events package already
 * had to be careful here (see `known` below), so this follows its shape
 * exactly rather than re-deriving it.
 *
 * Hits the SAME endpoint the events package defaults to:
 * `${apiBaseUrl}/api/communities/${communityTag}/stripe/connected`. This
 * package's config has no `stripeStatusUrl` override hook (only
 * `stripeConnectUrl`), so unlike the events version this always hits the
 * default path — if a consumer ever needs a different one (e.g. the
 * community app's member-owned-product flow), that config hook can be added
 * to ProductManagementConfig the same way it exists on
 * EventManagementConfig.
 *
 * No module-level cache (the events version has one, keyed by communityTag,
 * to survive repeated price-modal mounts). Skipped here: this hook is read
 * once per create-wizard mount for the pricing step's preset cards, not
 * remounted on every modal open/close the way the events tier editor is.
 */
export interface StripeStatus {
  connected: boolean;
  loading: boolean;
  /**
   * True only once the server actually answered. A 403 (wrong permission,
   * not "no account") or a network failure both collapse `connected` to
   * false for safety, but must NOT be shown to the seller as "you haven't
   * connected Stripe" — that claim is only true when `known` is true too.
   */
  known: boolean;
  /**
   * Where to send the seller to connect Stripe, so the "Paid" preset card
   * can be a real click target instead of a dead disabled card when Stripe
   * isn't connected yet. Null when there is no config (e.g. no provider
   * wired, same guard as above) — the card falls back to doing nothing
   * rather than throwing.
   */
  connectUrl: string | null;
}

/**
 * Who the Stripe-connected question is actually about.
 *
 * "community" (default — byte-identical to this hook's original behaviour)
 * hits the COMMUNITY-scoped, admin-gated `/api/communities/:tag/stripe/
 * connected` endpoint. "personal" hits the USER-scoped
 * `/api/users/me/stripe/status` endpoint instead — the correct check for a
 * member/personal-owned listing, where the seller's OWN account is what
 * matters, not the community's. See ProductForm's `ownership` prop and
 * PriceEditModal's `ownerType` prop, which both thread this through.
 */
export type StripeOwnerType = "community" | "personal";

/**
 * One-shot status fetch, usable outside a hook (e.g. PriceEditModal's
 * save-time gate, which must re-check status on every Save rather than once
 * on mount — a hook call cannot be made conditionally or inside an event
 * handler, so the fetch itself is pulled out as a plain async function and
 * `useStripeStatus` below is a thin effect wrapper around it).
 *
 * Never throws; a network failure or non-OK response collapses to
 * `{ connected: false, known: false }`, same safety rule as the hook.
 */
export async function fetchStripeStatus(
  config: Pick<ProductManagementConfig, "apiBaseUrl" | "authHeaders">,
  params: { communityTag: string; ownerType?: StripeOwnerType },
): Promise<{ connected: boolean; known: boolean }> {
  const { apiBaseUrl, authHeaders } = config;
  const ownerType = params.ownerType ?? "community";
  const url = ownerType === "personal"
    ? `${apiBaseUrl}/api/users/me/stripe/status`
    : `${apiBaseUrl}/api/communities/${params.communityTag}/stripe/connected`;
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return { connected: false, known: false };
    const data = await res.json();
    // Defensive on the field name: the community endpoint answers
    // `{ connected }`, the user-scoped one may answer `{ connected }` or
    // `{ chargesEnabled }` — accept either rather than guessing wrong and
    // reading a real "yes" as "no".
    return { connected: !!(data?.connected ?? data?.chargesEnabled), known: true };
  } catch {
    return { connected: false, known: false };
  }
}

export function useStripeStatus(communityTag: string, ownerType: StripeOwnerType = "community"): StripeStatus {
  /*
   * NOT a bare `useProductManagementConfig()` call. ProductForm's own doc
   * comment on DRAFT_CONFIG_STUB promises the create-time wizard makes ZERO
   * API calls and needs no provider wired above it — several existing
   * callers (the labels test, among others) render <ProductForm> with no
   * <ProductManagementConfigProvider> at all. useProductManagementConfig()
   * THROWS when there is no provider, so calling it unguarded here would
   * make every one of those callers crash just by this hook existing.
   * try/catch is safe around it: the underlying useContext still runs every
   * render in the same hook slot, only the throw-on-null is caught.
   */
  let config: ProductManagementConfig | null = null;
  try {
    config = useProductManagementConfig();
  } catch {
    config = null;
  }
  const [status, setStatus] = useState<Omit<StripeStatus, "connectUrl">>({ connected: false, loading: true, known: false });
  const connectUrl = config ? config.stripeConnectUrl(communityTag) : null;

  useEffect(() => {
    if (!communityTag || !config) {
      setStatus({ connected: false, loading: false, known: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await fetchStripeStatus(config, { communityTag, ownerType });
      if (!cancelled) setStatus({ ...result, loading: false });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag, config, ownerType]);

  return { ...status, connectUrl };
}
