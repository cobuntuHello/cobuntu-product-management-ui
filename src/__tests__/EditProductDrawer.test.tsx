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
});
