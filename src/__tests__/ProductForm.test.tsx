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

    // Free segment is active by default (isPaid false).
    onChange.mockClear();

    await user.click(screen.getByRole("button", { name: "Paid" }));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData | undefined;
      expect(last?.isPaid).toBe(true);
    });
  });

  it("showTiers={false}: tier toggle is NOT rendered, even when Paid", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: "Paid" }));
    expect(screen.queryByText(/advanced pricing/i)).not.toBeInTheDocument();
  });

  it("showTiers={true}: 'Advanced pricing' toggle is visible once Paid is selected", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ showTiers: true })} />);
    await user.click(screen.getByRole("button", { name: "Paid" }));
    await waitFor(() => expect(screen.getByText(/advanced pricing/i)).toBeInTheDocument());
  });

  it("emits viewability + accessibility defaulting to PUBLIC", async () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emitted = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
    expect(emitted.viewability).toBe("PUBLIC");
    expect(emitted.accessibility).toBe("PUBLIC");
  });

  it("toggling Visibility flips viewability to MEMBERS_ONLY (action gate stays untouched)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    onChange.mockClear();

    // Click the Visibility row label to toggle.
    await user.click(screen.getByText(/Visibility: Public/i));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
      expect(last.viewability).toBe("MEMBERS_ONLY");
      expect(last.accessibility).toBe("PUBLIC");
    });
  });

  it("toggling Purchase flips accessibility independently", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    onChange.mockClear();

    await user.click(screen.getByText(/Purchase: Public/i));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
      expect(last.accessibility).toBe("MEMBERS_ONLY");
      expect(last.viewability).toBe("PUBLIC");
    });
  });

  it("initialData honors caller-supplied viewability/accessibility", async () => {
    const onChange = vi.fn();
    renderWithConfig(
      <ProductForm
        {...baseProps({
          onChange,
          initialData: {
            ...(baseProps().initialData),
            viewability: "MEMBERS_ONLY" as const,
            accessibility: "MEMBERS_ONLY" as const,
          },
        })}
      />
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emitted = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
    expect(emitted.viewability).toBe("MEMBERS_ONLY");
    expect(emitted.accessibility).toBe("MEMBERS_ONLY");
  });

  it("multi-tier mode: emits a tiers array and clears parent price", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange, showTiers: true })} />);
    await user.click(screen.getByRole("button", { name: "Paid" })); // → Paid
    await waitFor(() => expect(screen.getByText(/advanced pricing/i)).toBeInTheDocument());

    // Flip on multi-tier (also opens the wizard)
    onChange.mockClear();
    await user.click(screen.getByText(/advanced pricing/i));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData | undefined;
      expect(last?.tiers?.length).toBeGreaterThanOrEqual(1);
      expect(last?.tiers?.[0]?.name).toBe("Standard");
      expect(last?.price).toBe(""); // parent price MUST be empty in multi-tier mode
    });
  });

  it("Advanced pricing opens the shared tier wizard (draftMode PriceEditModal)", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ showTiers: true })} />);
    await user.click(screen.getByRole("button", { name: "Paid" }));
    await user.click(await screen.findByText(/advanced pricing/i));

    // The wizard mounts in draftMode — its "Pricing tiers" header + a seeded
    // "Standard" tier row appear, with no network calls (stub config). The
    // name "Standard" shows in both the summary row and the modal's tier row,
    // so assert at least one such control exists.
    expect(await screen.findByRole("heading", { name: /pricing tiers|add pricing|edit pricing/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Standard/ }).length).toBeGreaterThanOrEqual(1);
  });
});
