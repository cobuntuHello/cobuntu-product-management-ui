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
}

export function useStripeStatus(communityTag: string): StripeStatus {
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
  const [status, setStatus] = useState<StripeStatus>({ connected: false, loading: true, known: false });

  useEffect(() => {
    if (!communityTag || !config) {
      setStatus({ connected: false, loading: false, known: false });
      return;
    }
    const { apiBaseUrl, authHeaders } = config;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/stripe/connected`, {
          headers: authHeaders(),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setStatus({ connected: !!data.connected, loading: false, known: true });
        } else {
          setStatus({ connected: false, loading: false, known: false });
        }
      } catch {
        if (!cancelled) setStatus({ connected: false, loading: false, known: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag, config]);

  return status;
}
