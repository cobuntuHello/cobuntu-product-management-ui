import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditProductDrawer } from "../components/EditProductDrawer";
import { renderWithConfig, mockFetch } from "./test-utils";

vi.mock("react-quill-new", () => ({ default: () => null }));

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
    expect(screen.getByDisplayValue("Buy Now")).toBeInTheDocument();
  });

  it("Cancel triggers onClose after the exit animation", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditProductDrawer {...props} />);

    await waitFor(() => expect(screen.getByText(/edit product/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /cancel/i }));

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
});
