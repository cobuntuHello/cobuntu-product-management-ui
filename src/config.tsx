"use client";

import * as React from "react";

/**
 * The auth-injection contract between the shared product-management UI
 * and its consuming apps. Each app has its own way of computing the API
 * base URL and the Authorization header — we accept it as React context.
 *
 * Wrap the product-management UI surface in `<ProductManagementConfigProvider
 * value={...}>` in each app's root (or in the layout containing the
 * /marketplace/[sku]/manage page).
 */
export interface ProductManagementConfig {
  /**
   * Base URL of the Cobuntu API (no trailing slash).
   */
  apiBaseUrl: string;

  /**
   * Returns the Authorization headers to attach to API requests. Called
   * once per request; should be cheap.
   */
  authHeaders: () => Record<string, string>;

  /**
   * The host app's avatar component. Optional — the package ships
   * UserAvatarFallback — but passing yours keeps the seeded-persona look
   * consistent with the rest of that app. Mirrors the event package.
   */
  UserAvatar?: React.ComponentType<{
    user: {
      name?: string | null;
      imageUrl?: string | null;
      profileImage?: string | null;
      usertag?: string | null;
      email?: string | null;
    };
    className?: string;
  }>;

  /**
   * Returns the path the user should be sent to in order to connect
   * Stripe for this community. Different host apps point at different
   * routes — admin's connect-stripe page vs community-app's
   * /hub/payouts/onboard. Used by `<StripeRequiredWarning>` to gate
   * paid-tier editing when the community hasn't connected Stripe yet.
   */
  stripeConnectUrl: (communityTag: string) => string;
}

const Ctx = React.createContext<ProductManagementConfig | null>(null);

/*
 * The same config, reachable without a hook — mirrors the event package.
 * The page shell moved in from the admin app brings module-level helpers
 * (authHeaders/jsonHeaders) that views and modals both import; rewriting each
 * into a hook would restructure files whose only sin is not being components.
 * The provider mirrors on render; components still read the CONTEXT.
 */
let currentConfig: ProductManagementConfig | null = null;

/** Non-hook accessor for module-level helpers. */
export function getProductManagementConfig(): ProductManagementConfig {
  if (!currentConfig) {
    throw new Error(
      "getProductManagementConfig() called before <ProductManagementConfigProvider> rendered",
    );
  }
  return currentConfig;
}

export function ProductManagementConfigProvider({
  value,
  children,
}: {
  value: ProductManagementConfig;
  children: React.ReactNode;
}) {
  currentConfig = value;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Hook accessor used inside the shared components. Throws if a component
 * renders outside the provider — surfaces wiring mistakes loudly rather
 * than silently defaulting to localhost.
 */
export function useProductManagementConfig(): ProductManagementConfig {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useProductManagementConfig: missing <ProductManagementConfigProvider value={...}>. " +
        "Wrap your product-management surface (e.g. the /marketplace/[sku]/manage layout) with the provider.",
    );
  }
  return ctx;
}

/**
 * Convenience: `{ "Content-Type": "application/json", ...auth }`.
 */
export function useJsonHeaders(): () => Record<string, string> {
  const { authHeaders } = useProductManagementConfig();
  return React.useCallback(
    () => ({ "Content-Type": "application/json", ...authHeaders() }),
    [authHeaders],
  );
}
