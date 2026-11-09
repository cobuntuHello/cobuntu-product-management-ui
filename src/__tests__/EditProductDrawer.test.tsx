import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditProductDrawer } from "../components/EditProductDrawer";
import { renderWithConfig, mockFetch } from "./test-utils";

const product = {
  id: "p-1",
  name: "Cool product",
  description: "",
  price: 2500,
  currency: "EUR",
  isRecurring: false,
  recurringInterval: "monthly",
  ctaText: "Buy Now",
  tags: [],
  media: [],
  attachments: [],
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product,
  communityTag: "orbis",
  isOpen: true,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  ...overrides,
});

describe("EditProductDrawer", () => {
  it("renders nothing when isOpen is false", () => {
    renderWithConfig(<EditProductDrawer {...baseProps({ isOpen: false })} />);
    expect(screen.queryByText(/edit product/i)).not.toBeInTheDocument();
  });

  it("renders the drawer + initial product values when isOpen is true", async () => {
    renderWithConfig(<EditProductDrawer {...baseProps()} />);

    await waitFor(() => expect(screen.getByText(/edit product/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument();
    // The CTA is no longer an inline input: it collapsed into a summary row
    // that opens a modal, so the preloaded value shows as the row's subtitle
    // (in curly quotes) rather than as a field value. That it reaches the
    // submitted payload is pinned separately, below.
    expect(
      screen.getByText((_t, el) => el?.textContent?.trim() === "\u201cBuy Now\u201d"),
    ).toBeInTheDocument();
  });

  it("Cancel triggers onClose after the exit animation", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);

    await waitFor(() => expect(screen.getByText(/edit product/i)).toBeInTheDocument());

    /*
     * EXACT name, not /cancel/i. The drawer now also carries the refund-policy
     * control, whose "Cancellation schedule" option is itself a button -- so
     * the loose matcher found two and threw. The component was never wrong;
     * the query was simply no longer specific enough to name the one control
     * this test is about.
     */
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled(), { timeout: 1000 });
  });

  it("on Save: PUTs FormData to /comprehensive, polls job, calls onSaved", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/products/p-1/comprehensive", body: { jobId: "j-1" } },
      { method: "GET", url: "/products/update/status/j-1", body: { status: "completed" } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);

    // Wait for the form to be mounted + onChange to have populated formDataRef.
    await waitFor(() => expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // The poll loop waits 2s between status checks; allow plenty of room.
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });

    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    expect(putCall![1]?.body).toBeInstanceOf(FormData);
    const formData = putCall![1]!.body as FormData;
    expect(formData.get("name")).toBe("Cool product");
    expect(formData.get("ctaText")).toBe("Buy Now");
  }, 10000);

  // ── Link deliverables (feat/product-link-deliverable) ──────────────
  const productWithLinks = {
    ...product,
    attachments: [
      { id: "att-file-1", kind: "FILE", originalName: "guide.pdf", fileName: "guide.pdf", fileSize: 1234, mimeType: "application/pdf", url: "http://files/guide.pdf" },
      { id: "att-link-1", kind: "LINK", originalName: "Download page", fileName: "", fileSize: 0, mimeType: "text/uri-list", url: "https://seller.example/download" },
    ],
  };

  it("lists existing LINK attachments in the Link deliverables section", async () => {
    renderWithConfig(<EditProductDrawer {...baseProps({ product: productWithLinks })} />);
    await waitFor(() => expect(screen.getByText(/link deliverables/i)).toBeInTheDocument());
    expect(screen.getByText("Download page")).toBeInTheDocument();
    expect(screen.getByText("https://seller.example/download")).toBeInTheDocument();
  });

  it("stages a new link and POSTs it to the link endpoint after Save", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/products/p-1/comprehensive", body: { jobId: "j-1" } },
      { method: "GET", url: "/products/update/status/j-1", body: { status: "completed" } },
      { method: "POST", url: "/products/p-1/attachments/link", body: { id: "att-new", kind: "LINK" } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);

    await waitFor(() => expect(screen.getByText(/link deliverables/i)).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/^Label/), "Bonus pack");
    await user.type(screen.getByPlaceholderText(/^https/), "https://seller.example/bonus");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    expect(screen.getByText("Bonus pack")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });

    const linkPost = fetchMock.mock.calls.find(
      c => String(c[0]).endsWith("/products/p-1/attachments/link") && (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(linkPost).toBeDefined();
    expect(JSON.parse((linkPost![1] as RequestInit).body as string)).toMatchObject({
      url: "https://seller.example/bonus",
      label: "Bonus pack",
    });
  }, 10000);

  it("rejects a non-http(s) link and does not stage it", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EditProductDrawer {...baseProps()} />);
    await waitFor(() => expect(screen.getByText(/link deliverables/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/^https/), "ftp://nope");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    expect(screen.getByText(/valid http\(s\) link/i)).toBeInTheDocument();
  });

  it("removing an existing link adds only its id to attachmentsToDelete on Save", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/products/p-1/comprehensive", body: { jobId: "j-1" } },
      { method: "GET", url: "/products/update/status/j-1", body: { status: "completed" } },
    ]);
    const user = userEvent.setup();
    const props = baseProps({ product: productWithLinks });
    renderWithConfig(<EditProductDrawer {...props} />);

    await waitFor(() => expect(screen.getByText("Download page")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /remove download page/i }));

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });

    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    const fd = putCall![1]!.body as FormData;
    const toDelete = JSON.parse((fd.get("attachmentsToDelete") as string) || "[]");
    expect(toDelete).toContain("att-link-1");
    expect(toDelete).not.toContain("att-file-1");
  }, 10000);

  it("a plain save does NOT delete existing file attachments", async () => {
    /*
     * The regression this guards. The delete list used to be a DIFF against
     * `data.productFiles`, which was correct while the form owned product-level
     * files. Once deliverables moved inside each variant, ProductForm began
     * emitting `productFiles: []` unconditionally — so the diff saw no
     * survivors and marked every existing attachment for deletion. Editing a
     * product's title would have destroyed its downloads.
     *
     * Asserted on a save that changes NOTHING, because that is the weakest
     * possible intent: if an untouched save deletes a file, every save does.
     */
    const fetchMock = mockFetch([
      { method: "PUT", url: "/products/p-1/comprehensive", body: { jobId: "j-1" } },
      { method: "GET", url: "/products/update/status/j-1", body: { status: "completed" } },
    ]);
    const user = userEvent.setup();
    const props = baseProps({ product: productWithLinks });
    renderWithConfig(<EditProductDrawer {...props} />);

    await waitFor(() => expect(screen.getByText("Download page")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });

    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    const fd = putCall![1]!.body as FormData;
    const toDelete = JSON.parse((fd.get("attachmentsToDelete") as string) || "[]");
    expect(toDelete).not.toContain("att-file-1");
    expect(toDelete).toHaveLength(0);
  }, 10000);

  it("on a partial link-POST failure: surfaces the error and does not duplicate the posted link on retry", async () => {
    // First link POST succeeds, second fails. On retry only the un-posted link
    // should be sent again (no duplicate of the first).
    let linkPosts = 0;
    const posted: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "PUT" && url.endsWith("/products/p-1/comprehensive")) return new Response(JSON.stringify({ jobId: "j-1" }), { status: 200 });
      if (method === "GET" && url.endsWith("/products/update/status/j-1")) return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
      if (method === "POST" && url.endsWith("/products/p-1/attachments/link")) {
        linkPosts++;
        const body = JSON.parse((init!.body as string));
        if (linkPosts === 2) return new Response(JSON.stringify({ error: "boom" }), { status: 500 }); // second call fails
        posted.push(body.label);
        return new Response(JSON.stringify({ id: `att-${body.label}`, kind: "LINK" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    global.fetch = fetchImpl as unknown as typeof fetch;

    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);
    await waitFor(() => expect(screen.getByText(/link deliverables/i)).toBeInTheDocument());

    // Stage two links.
    await user.type(screen.getByPlaceholderText(/^Label/), "L1");
    await user.type(screen.getByPlaceholderText(/^https/), "https://s.example/1");
    await user.click(screen.getByRole("button", { name: /add link/i }));
    await user.type(screen.getByPlaceholderText(/^Label/), "L2");
    await user.type(screen.getByPlaceholderText(/^https/), "https://s.example/2");
    await user.click(screen.getByRole("button", { name: /add link/i }));

    // First save: L1 posts OK, L2 500s → error surfaced, onSaved NOT called.
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText(/boom|failed/i)).toBeInTheDocument(), { timeout: 8000 });
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(posted).toEqual(["L1"]);

    // Retry: make everything succeed now; only L2 should be POSTed again.
    linkPosts = 10; // past the failure branch
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });
    const l2Retries = fetchImpl.mock.calls.filter(c => c[0].endsWith("/attachments/link") && (c[1] as RequestInit)?.method === "POST" && JSON.parse((c[1] as RequestInit).body as string).label === "L2");
    const l1Total = fetchImpl.mock.calls.filter(c => c[0].endsWith("/attachments/link") && (c[1] as RequestInit)?.method === "POST" && JSON.parse((c[1] as RequestInit).body as string).label === "L1");
    expect(l1Total.length).toBe(1); // L1 never re-POSTed → no duplicate
    expect(l2Retries.length).toBe(2); // L2 tried on both saves
  }, 15000);
});

/*
 * The refund picker was on screen and its answer never sent, so the drawer
 * saved every policy as Standard. Seeded from the product, and sent only on a
 * change, because the server re-stamps who set it on every write.
 */
describe("EditProductDrawer: refund policy", () => {
  const NONE = { mode: "default", customBuyerWindowDays: 0 };

  async function saveAndGetBody(props: ReturnType<typeof baseProps>, fetchMock: ReturnType<typeof mockFetch>) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });
    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    return putCall![1]!.body as FormData;
  }

  const routes = () => mockFetch([
    { method: "PUT", url: "/products/p-1/comprehensive", body: { jobId: "j-1" } },
    { method: "GET", url: "/products/update/status/j-1", body: { status: "completed" } },
  ]);

  it("sends the seller's new choice", async () => {
    const fetchMock = routes();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /no self-service refunds/i }));
    const body = await saveAndGetBody(props, fetchMock);

    expect(JSON.parse(body.get("refundPolicy") as string)).toEqual(NONE);
  }, 10000);

  it("opens on the saved policy and does not re-send it when untouched", async () => {
    const fetchMock = routes();
    const props = baseProps({ product: { ...product, refundPolicy: { ...NONE, updatedByUserId: "seller-1" } } });
    renderWithConfig(<EditProductDrawer {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /no self-service refunds/i })).toHaveAttribute("aria-pressed", "true");
    const body = await saveAndGetBody(props, fetchMock);

    expect(body.get("refundPolicy")).toBeNull();
  }, 10000);

  it("sends null when a seller goes back to Standard", async () => {
    const fetchMock = routes();
    const user = userEvent.setup();
    const props = baseProps({ product: { ...product, refundPolicy: NONE } });
    renderWithConfig(<EditProductDrawer {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /standard refunds/i }));
    const body = await saveAndGetBody(props, fetchMock);

    expect(body.get("refundPolicy")).toBe("null");
  }, 10000);
});

/* Never sent before, so flipping the switch in the drawer saved nothing. */
describe("EditProductDrawer: can be bought more than once", () => {
  const routes = () => mockFetch([
    { method: "PUT", url: "/products/p-1/comprehensive", body: { jobId: "j-1" } },
    { method: "GET", url: "/products/update/status/j-1", body: { status: "completed" } },
  ]);
  async function save(props: ReturnType<typeof baseProps>, fetchMock: ReturnType<typeof mockFetch>) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 8000 });
    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    return putCall![1]!.body as FormData;
  }

  it("sends the switch once the seller flips it", async () => {
    const fetchMock = routes();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument());

    await user.click(screen.getByText("Can be bought more than once"));
    const body = await save(props, fetchMock);

    expect(body.get("allowRepeatPurchase")).toBe("false");
  }, 10000);

  it("does not send it when untouched, so the column stays derived", async () => {
    const fetchMock = routes();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("Cool product")).toBeInTheDocument());

    const body = await save(props, fetchMock);

    expect(body.get("allowRepeatPurchase")).toBeNull();
  }, 10000);
});
