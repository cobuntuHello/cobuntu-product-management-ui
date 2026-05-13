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
}

const Ctx = React.createContext<ProductManagementConfig | null>(null);

export function ProductManagementConfigProvider({
  value,
  children,
}: {
  value: ProductManagementConfig;
  children: React.ReactNode;
}) {
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
