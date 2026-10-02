import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { DetailsView } from "../page/views/DetailsView";

/**
 * Renaming must use the base the HOST injected, whatever it is.
 *
 * THE BUG THIS EXISTS FOR: `quickUpdate` built its URL with
 * `${apiBaseUrl || API}`. The community app injects an EMPTY base on purpose,
 * so these calls stay same-origin and the browser sends the httpOnly session
 * cookie by itself. `""` is falsy, so the fallback replaced it with the
 * absolute api.cobuntu.com, which is cross-origin from a community's own
 * domain. No cookie goes on a cross-origin fetch without
 * `credentials: "include"`, and the shim's authHeaders returns {} by design,
 * so there was nothing to authenticate with.
 *
 * Renaming therefore answered 401 every time, on every community, while the
 * tags and description modals beside it kept working. It reached production
 * because every test in this suite injects an ABSOLUTE base, where the
 * fallback is invisible: `"http://api.test" || API` is `"http://api.test"`.
 * The empty base is the only case that fails, and nothing exercised it.
 */

const product = {
  id: "p1",
  name: "Own Your Time",
  price: 0,
  currency: "EUR",
  description: "",
  media: [],
};

function renderOverview(config: Record<string, any> = {}) {
  return renderWithConfig(
    <DetailsView
      product={product}
      communityTag="shesapiens"
      productId="p1"
      isPublished={false}
      listingId={null}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      showToast={vi.fn()}
    />,
    { config },
  );
}

/** Open Edit Name, type a new one, press Save. */
async function rename(to: string) {
  await userEvent.click(screen.getByText("Own Your Time"));
  const input = await screen.findByDisplayValue("Own Your Time");
  await userEvent.clear(input);
  await userEvent.type(input, to);
  /*
   * The modal's OWN Save. The description section below the card has one too,
   * so an unscoped query finds two and the test fails before it ever reaches
   * the thing it is about.
   */
  const dialog = input.closest(".fixed") ?? input.parentElement!;
  const save = within(dialog as HTMLElement).getByRole("button", { name: "Save" });
  await userEvent.click(save);
}

/** The PATCH the rename made, if it made one. */
function patchCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(
    ([, init]: any) => (init?.method || "").toUpperCase() === "PATCH",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renaming a product", () => {
  it("stays same-origin when the host injects an empty base", async () => {
    /*
     * The whole bug, in one assertion. A relative URL is what lets the
     * browser attach the session cookie; an absolute one silently drops it.
     */
    const fetchMock = mockFetch([
      { method: "GET", url: /\/tiers/, body: [] },
      { method: "PATCH", url: /products\/p1/, body: { id: "p1" } },
      { method: "GET", url: /.*/, body: {} },
    ]);

    renderOverview({ apiBaseUrl: "", authHeaders: () => ({}) });
    await rename("Own Your Time (Live call + workbook)");

    await waitFor(() => expect(patchCall(fetchMock)).toBeTruthy());
    const [url] = patchCall(fetchMock)!;
    expect(url).toBe("/api/users/me/products/p1");
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it("still honours an absolute base, which is what admin injects", async () => {
    // Admin passes NEXT_PUBLIC_API_URL and authenticates with headers, so the
    // fix must not quietly make every host same-origin.
    const fetchMock = mockFetch([
      { method: "GET", url: /\/tiers/, body: [] },
      { method: "PATCH", url: /products\/p1/, body: { id: "p1" } },
      { method: "GET", url: /.*/, body: {} },
    ]);

    renderOverview({ apiBaseUrl: "http://api.test" });
    await rename("Renamed");

    await waitFor(() => expect(patchCall(fetchMock)).toBeTruthy());
    expect(patchCall(fetchMock)![0]).toBe("http://api.test/api/users/me/products/p1");
  });

  it("sends the name the seller typed, parentheses and all", async () => {
    // The seller's own guess was that the title was too long or had odd
    // characters in it. It was neither, and nothing here trims or rejects.
    const fetchMock = mockFetch([
      { method: "GET", url: /\/tiers/, body: [] },
      { method: "PATCH", url: /products\/p1/, body: { id: "p1" } },
      { method: "GET", url: /.*/, body: {} },
    ]);

    renderOverview({ apiBaseUrl: "" });
    await rename("Own Your Time (Live call + workbook)");

    await waitFor(() => expect(patchCall(fetchMock)).toBeTruthy());
    const [, init] = patchCall(fetchMock)!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: "Own Your Time (Live call + workbook)",
    });
  });

  it("tells the seller when the save failed", async () => {
    /*
     * The silent half of the same report. NameEditModal swallows what is
     * thrown so it can stay open, and nothing else surfaced a message, so a
     * rejected save looked exactly like a button that had not been pressed.
     * The seller pressed Save eleven times.
     */
    mockFetch([
      { method: "GET", url: /\/tiers/, body: [] },
      { method: "PATCH", url: /products\/p1/, status: 401, body: {} },
      { method: "GET", url: /.*/, body: {} },
    ]);
    const showToast = vi.fn();

    renderWithConfig(
      <DetailsView
        product={product}
        communityTag="shesapiens"
        productId="p1"
        isPublished={false}
        listingId={null}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        showToast={showToast}
      />,
      { config: { apiBaseUrl: "" } },
    );
    await rename("Anything");

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0][0]).toMatch(/session expired/i);
  });

  it("prefers the server's own words when it sends them", async () => {
    mockFetch([
      { method: "GET", url: /\/tiers/, body: [] },
      {
        method: "PATCH",
        url: /products\/p1/,
        status: 400,
        body: { error: "Product name must be 100 characters or fewer." },
      },
      { method: "GET", url: /.*/, body: {} },
    ]);
    const showToast = vi.fn();

    renderWithConfig(
      <DetailsView
        product={product}
        communityTag="shesapiens"
        productId="p1"
        isPublished={false}
        listingId={null}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        showToast={showToast}
      />,
      { config: { apiBaseUrl: "" } },
    );
    await rename("x".repeat(120));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0][0]).toBe("Product name must be 100 characters or fewer.");
  });
});
