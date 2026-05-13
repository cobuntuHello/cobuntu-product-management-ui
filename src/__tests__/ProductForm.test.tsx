import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductForm, type ProductFormData } from "../components/ProductForm";
import { renderWithConfig } from "./test-utils";

// react-quill-new touches `document` on import and isn't worth rendering for a
// smoke test of the form itself — the description editor lives in a Dialog
// that we never open here.
vi.mock("react-quill-new", () => ({ default: () => null }));

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  communityTag: "orbis",
  initialData: {
    name: "Cool product",
    description: "",
    tags: [],
    mediaItems: [],
    productFiles: [],
    isPaid: false,
    price: "",
    currency: "USD",
    isRecurring: false,
    recurringInterval: "monthly" as const,
    ctaText: "",
  },
  onChange: vi.fn(),
  ...overrides,
});

describe("ProductForm", () => {
  it("renders the major sections", () => {
    renderWithConfig(<ProductForm {...baseProps()} />);

    expect(screen.getByRole("heading", { name: /product name/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^description$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /product gallery/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /product files/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /call-to-action text/i })).toBeInTheDocument();
  });

  it("preloads initialData (name + CTA text)", () => {
    renderWithConfig(<ProductForm {...baseProps({ initialData: {
      ...baseProps().initialData,
      name: "Pre-filled",
      ctaText: "Buy Now",
    } })} />);

    expect(screen.getByDisplayValue("Pre-filled")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Buy Now")).toBeInTheDocument();
  });

  it("notifies parent via onChange when the name changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);

    onChange.mockClear();
    const input = screen.getByDisplayValue("Cool product");
    await user.clear(input);
    await user.type(input, "X");

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData | undefined;
      expect(last?.name).toBe("X");
    });
  });

  it("starts in Free mode and switches to Paid when the toggle is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);

    expect(screen.getByText(/free product/i)).toBeInTheDocument();
    onChange.mockClear();

    await user.click(screen.getByText(/free product/i));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData | undefined;
      expect(last?.isPaid).toBe(true);
    });
    expect(screen.getByText(/paid product/i)).toBeInTheDocument();
  });
});
