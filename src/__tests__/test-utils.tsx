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
  // NO default /stripe/connected stub any more. There used to be one, always
  // answering `{ connected: true, chargesEnabled: true }`, because the modal
  // called useStripeStatus on mount to gate paid-tier editing.
  //
  // That default is why the suite never caught the bug it was covering for:
  // every test ran the happy path, so the gate's failure mode — a community
  // with no Stripe, or (far more often) a 403 from the admin-only status
  // endpoint being read as "no payment account" — was untested and shipped.
  // A mock that silently supplies the good answer hides the only cases worth
  // asserting.
  //
  // The gate is gone and the modal no longer fetches that endpoint at all, so
  // any request for it now correctly falls through to "Unmocked fetch".
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    for (const r of routes) {
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
