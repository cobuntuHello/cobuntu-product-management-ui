import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { ProductManagementConfigProvider, type ProductManagementConfig } from "../config";

const defaultConfig: ProductManagementConfig = {
  apiBaseUrl: "http://api.test",
  authHeaders: () => ({ Authorization: "Bearer test-token" }),
  stripeConnectUrl: (communityTag: string) => `/test-stripe-connect/${communityTag}`,
};

export function renderWithConfig(
  ui: React.ReactElement,
  options: { config?: Partial<ProductManagementConfig> } & Omit<RenderOptions, "wrapper"> = {},
) {
  const { config: configOverrides, ...renderOptions } = options;
  const value: ProductManagementConfig = { ...defaultConfig, ...configOverrides };
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ProductManagementConfigProvider value={value}>{children}</ProductManagementConfigProvider>
  );
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export function mockFetch(routes: Array<{
  method?: string;
  url: string | RegExp;
  status?: number;
  body?: unknown;
  bodyFn?: (init: RequestInit | undefined) => unknown;
}>): ReturnType<typeof vi.fn> {
  // Default Stripe-status response so any test that opens PriceEditModal
  // doesn't have to remember to mock /stripe/connected — the modal calls
  // useStripeStatus on mount to gate paid-tier editing. Tests can still
  // override by passing their own /stripe/connected stub earlier in the
  // routes array (first-match-wins).
  const defaultRoutes = [{
    method: "GET",
    url: /\/api\/communities\/[^/]+\/stripe\/connected$/,
    body: { connected: true, chargesEnabled: true },
  }];
  const allRoutes = [...routes, ...defaultRoutes];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    for (const r of allRoutes) {
      const methodOk = !r.method || r.method.toUpperCase() === method;
      const urlOk = typeof r.url === "string" ? url === r.url || url.endsWith(r.url) : r.url.test(url);
      if (methodOk && urlOk) {
        const body = r.bodyFn ? r.bodyFn(init) : r.body;
        return new Response(JSON.stringify(body ?? {}), {
          status: r.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw new Error(`Unmocked fetch: ${method} ${url}`);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}
