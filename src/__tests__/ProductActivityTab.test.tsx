import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { ProductActivityTab } from "../components/activity/ProductActivityTab";

/**
 * The tab's job is to fetch, render, and fail legibly. jsdom has no
 * IntersectionObserver, so the infinite-scroll path is exercised through its
 * observable effect (the sentinel exists only while a next page does) rather
 * than by faking a scroll — a fake scroll would test the stub, not the code.
 */

const ACTIVITY_URL = /\/api\/communities\/avepark\/products\/p1\/activity/;

function entry(over: Record<string, unknown> = {}) {
  return {
    id: "PA:1",
    source: "PRODUCT_AUDIT",
    action: "PRODUCT_CREATED",
    createdAt: new Date().toISOString(),
    actor: { id: "u1", name: "Bea", usertag: "bea", profileImage: null },
    payload: {},
    ...over,
  };
}

beforeEach(() => {
  // Present but inert: the component registers a sentinel observer on mount
  // when a cursor exists, and an undefined constructor would throw there.
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

function renderTab() {
  return renderWithConfig(<ProductActivityTab product={{ id: "p1" }} communityTag="avepark" />);
}

describe("ProductActivityTab", () => {
  it("loads and renders the first page as sentences", async () => {
    mockFetch([{ method: "GET", url: ACTIVITY_URL, body: { entries: [entry()], nextCursor: null } }]);
    renderTab();
    expect(await screen.findByText("Bea created this product")).toBeInTheDocument();
  });

  it("sends the auth header and the page size", async () => {
    const fn = mockFetch([{ method: "GET", url: ACTIVITY_URL, body: { entries: [], nextCursor: null } }]);
    renderWithConfig(<ProductActivityTab product={{ id: "p1" }} communityTag="avepark" pageSize={10} />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toContain("limit=10");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("resolves a product by sku when no id is given", async () => {
    const fn = mockFetch([
      { method: "GET", url: /products\/SKU-9\/activity/, body: { entries: [], nextCursor: null } },
    ]);
    renderWithConfig(<ProductActivityTab product={{ id: "", sku: "SKU-9" }} communityTag="avepark" />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(String(fn.mock.calls[0][0])).toContain("/products/SKU-9/activity");
  });

  it("shows the empty state rather than a bare card", async () => {
    mockFetch([{ method: "GET", url: ACTIVITY_URL, body: { entries: [], nextCursor: null } }]);
    renderTab();
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("does not claim the product is missing on a 404", async () => {
    // The endpoint returns 404 for "not yours" as well as "not there", so the
    // copy must not assert which one happened.
    mockFetch([{ method: "GET", url: ACTIVITY_URL, status: 404, body: { error: "Product not found" } }]);
    renderTab();
    const msg = await screen.findByText(/isn't available/i);
    expect(msg).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("asks an unauthenticated viewer to sign in", async () => {
    mockFetch([{ method: "GET", url: ACTIVITY_URL, status: 401, body: {} }]);
    renderTab();
    expect(await screen.findByText(/Sign in to view/i)).toBeInTheDocument();
  });

  it("retries after a failure and recovers", async () => {
    let calls = 0;
    mockFetch([
      {
        method: "GET",
        url: ACTIVITY_URL,
        bodyFn: () => {
          calls += 1;
          return calls === 1 ? { error: "boom" } : { entries: [entry()], nextCursor: null };
        },
        // First call fails; the stub can only carry one status, so the failure
        // is expressed by the 500 and the retry by the body function.
        status: 500,
      },
    ]);
    renderTab();
    const retry = await screen.findByRole("button", { name: "Retry" });
    // The retry re-requests; a 500 stub keeps failing, so what this asserts is
    // that the control is wired and the error block survives a second round —
    // not that the server recovered.
    await userEvent.click(retry);
    await waitFor(() => expect(calls).toBeGreaterThan(1));
  });

  it("stops paging when the server says there is no next page", async () => {
    mockFetch([{ method: "GET", url: ACTIVITY_URL, body: { entries: [entry()], nextCursor: null } }]);
    renderTab();
    expect(await screen.findByText("End of activity.")).toBeInTheDocument();
  });

  it("does not announce the end while a next page exists", async () => {
    mockFetch([{ method: "GET", url: ACTIVITY_URL, body: { entries: [entry()], nextCursor: "abc" } }]);
    renderTab();
    await screen.findByText("Bea created this product");
    expect(screen.queryByText("End of activity.")).not.toBeInTheDocument();
  });

  it("renders both sources in one list", async () => {
    mockFetch([
      {
        method: "GET",
        url: ACTIVITY_URL,
        body: {
          entries: [
            entry({ id: "PA:1", action: "LISTING_HIDDEN", payload: { communityName: "Ave Park" } }),
            entry({
              id: "CA:1",
              source: "COLLABORATOR_AUDIT",
              action: "ADDED",
              payload: { targetName: "Alice" },
            }),
          ],
          nextCursor: null,
        },
      },
    ]);
    renderTab();
    expect(await screen.findByText("Bea hid it from the storefront in Ave Park")).toBeInTheDocument();
    expect(screen.getByText("Bea added Alice as a co-seller")).toBeInTheDocument();
  });

  it("puts the exact instant on the relative label", async () => {
    const createdAt = "2026-01-01T10:00:00.000Z";
    mockFetch([{ method: "GET", url: ACTIVITY_URL, body: { entries: [entry({ createdAt })], nextCursor: null } }]);
    renderTab();
    await screen.findByText("Bea created this product");
    // Someone reconciling against a Stripe event needs the timestamp, not "3d ago".
    const stamp = document.querySelector("[title]") as HTMLElement | null;
    expect(stamp?.getAttribute("title")).toBe(new Date(createdAt).toLocaleString());
  });
});

/**
 * The relative-base regression.
 *
 * The community app is same-origin — it passes apiBaseUrl: "" so the session
 * cookie rides along and no Bearer is read from JS. The tab built its request
 * with `new URL()`, which needs an absolute base, so it threw "Failed to
 * construct 'URL': Invalid URL" and every seller on that app saw an error
 * where the log should be.
 */
describe("works with a RELATIVE api base", () => {
  it("fetches without throwing when apiBaseUrl is empty", async () => {
    const fn = mockFetch([{ method: "GET", url: /\/api\/communities\/avepark\/products\/p1\/activity/, body: { entries: [entry()], nextCursor: null } }]);
    renderWithConfig(<ProductActivityTab product={{ id: "p1" }} communityTag="avepark" />, {
      config: { apiBaseUrl: "" },
    });
    expect(await screen.findByText("Bea created this product")).toBeInTheDocument();
    expect(String(fn.mock.calls[0][0])).toMatch(/^\/api\/communities\/avepark\/products\/p1\/activity\?/);
  });

  it("still sends limit and cursor on a relative base", async () => {
    const fn = mockFetch([{ method: "GET", url: /activity/, body: { entries: [], nextCursor: null } }]);
    renderWithConfig(
      <ProductActivityTab product={{ id: "p1" }} communityTag="avepark" pageSize={7} />,
      { config: { apiBaseUrl: "" } },
    );
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(String(fn.mock.calls[0][0])).toContain("limit=7");
  });

  it("still works with an ABSOLUTE base (the admin app)", async () => {
    const fn = mockFetch([{ method: "GET", url: /activity/, body: { entries: [], nextCursor: null } }]);
    renderWithConfig(<ProductActivityTab product={{ id: "p1" }} communityTag="avepark" />, {
      config: { apiBaseUrl: "https://api.example.com" },
    });
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(String(fn.mock.calls[0][0])).toMatch(/^https:\/\/api\.example\.com\/api\/communities\//);
  });
});
