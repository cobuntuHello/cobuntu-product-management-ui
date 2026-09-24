import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

/** A saved-looking variant that carries the price, as the API returns one. */
const pricedTier = (price: string) => ({
  localId: "t1",
  name: "Standard",
  description: "",
  licenseTerms: "",
  maxDownloads: "",
  price,
  currency: "USD",
  capacity: "",
  priceMode: "fixed" as const,
  pwywMin: "",
  isRecurring: false,
  recurringInterval: "monthly" as const,
  hasForm: false,
  formFieldCount: 0,
  salesCount: 0,
  deleted: false,
  publishedAt: new Date().toISOString(),
});

describe("ProductForm", () => {
  it("renders the major sections", () => {
    // The form is collapsed rows now, not headed sections - it renders no
    // headings at all - so each section is identified by the control that
    // opens it. "Product files" is absent on purpose: deliverables moved
    // inside each variant.
    renderWithConfig(<ProductForm {...baseProps({ showTiers: true })} />);

    expect(screen.getByPlaceholderText("Product Name")).toBeInTheDocument();
    expect(screen.getByText("Add description")).toBeInTheDocument();
    // Several add-photo affordances (one per empty slot) - one is enough.
    expect(screen.getAllByLabelText("Add photo").length).toBeGreaterThan(0);
    expect(screen.getByText("Call to Action Label")).toBeInTheDocument();
    expect(screen.getByText("Variants")).toBeInTheDocument();
  });

  it("preloads initialData (name + CTA text)", () => {
    renderWithConfig(<ProductForm {...baseProps({ initialData: {
      ...baseProps().initialData,
      name: "Pre-filled",
      ctaText: "Buy Now",
    } })} />);

    expect(screen.getByDisplayValue("Pre-filled")).toBeInTheDocument();
    // The CTA collapsed into a summary row that opens a modal, so its value
    // shows as the row subtitle (curly-quoted) rather than as a field value.
    expect(
      screen.getByText((_t, el) => el?.textContent?.trim() === "\u201cBuy Now\u201d"),
    ).toBeInTheDocument();
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

  it("derives isPaid from the variant price instead of a Free/Paid toggle", async () => {
    /*
     * The product-level Free/Paid toggle was removed: pricing lives per
     * variant now, and a toggle beside it was a second control writing the
     * same answer. isPaid is still emitted - it gates the Stripe connect
     * check - but it is now strictly PRICE-derived.
     *
     * Worth pinning precisely because it is derived: if it ever stopped
     * tracking the variants, a seller could price a product and still be told
     * they need no payment setup, and the failure would only show at checkout.
     */
    const free = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({ onChange: free, showTiers: true })} />);
    await waitFor(() => expect(free).toHaveBeenCalled());
    expect((free.mock.calls.at(-1)?.[0] as ProductFormData).isPaid).toBe(false);

    const paid = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({
      onChange: paid,
      showTiers: true,
      initialData: { ...baseProps().initialData, tiers: [pricedTier("25")] as any },
    })} />);
    await waitFor(() => expect(paid).toHaveBeenCalled());
    expect((paid.mock.calls.at(-1)?.[0] as ProductFormData).isPaid).toBe(true);
  });

  it("showTiers={false}: no Variants card at all", () => {
    // There is no longer an "Advanced pricing" opt-in gating the card - the
    // Variants card IS the pricing surface, so showTiers is the only gate.
    renderWithConfig(<ProductForm {...baseProps()} />);
    expect(screen.queryByText("Variants")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add variant/i })).not.toBeInTheDocument();
  });

  it("showTiers={true}: the Variants card is there immediately, no opt-in", () => {
    renderWithConfig(<ProductForm {...baseProps({ showTiers: true })} />);
    expect(screen.getByText("Variants")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add variant/i })).toBeInTheDocument();
  });

  it("emits viewability + accessibility defaulting to PUBLIC", async () => {
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emitted = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
    expect(emitted.viewability).toBe("PUBLIC");
    expect(emitted.accessibility).toBe("PUBLIC");
  });

  it("narrowing who can see it drags the buy gate in with it", async () => {
    /*
     * The binary "Visibility: Everyone" switch became a membership-tier list
     * whose top row is Public. Unticking Public is the same intent, expressed
     * through the control that replaced it.
     *
     * This asserted `accessibility` stayed PUBLIC - "leaving the buy gate
     * alone" - and so pinned the bug as behaviour. Buying is a SUBSET of
     * seeing: a members-only product anyone can buy is not permissive, it is
     * unreachable, because the view gate runs first and the non-members that
     * PUBLIC invites never see the page. Narrowing view now pulls buying to
     * the widest state still honourable, which is view itself.
     */
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    onChange.mockClear();

    await user.click(screen.getAllByRole("checkbox", { name: /Public/ })[0]);

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
      expect(last.viewability).toBe("MEMBERS_ONLY");
      expect(last.accessibility).toBe("MEMBERS_ONLY");
    });
  });

  it("still lets the buy gate be NARROWER than the view gate", async () => {
    // The ceiling only stops buying going wider. Seen by everyone and sold to
    // one tier is the case the whole feature exists for.
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    onChange.mockClear();

    // Under Public, "All members" is implied and carries a tag rather than a
    // checkbox - so the buy axis narrows via its OWN Public row.
    const publicRows = screen.getAllByRole("checkbox", { name: /Public/ });
    await user.click(publicRows[publicRows.length - 1]);

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData;
      expect(last.viewability).toBe("PUBLIC");
      expect(last.accessibility).toBe("MEMBERS_ONLY");
    });
  });

  it("narrowing who can buy it flips accessibility independently", async () => {
    // Second picker on the page, hence [1]: the axes stay separate.
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ onChange })} />);
    onChange.mockClear();

    await user.click(screen.getAllByRole("checkbox", { name: /Public/ })[1]);

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

  it("emits the tiers array and leaves the parent price empty", async () => {
    // The parent price must stay empty whenever variants carry the price, or
    // the product has two prices and the backend has to guess which is real.
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...baseProps({
      onChange,
      showTiers: true,
      initialData: { ...baseProps().initialData, tiers: [pricedTier("25")] as any },
    })} />);

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as ProductFormData | undefined;
      expect(last?.tiers?.length).toBeGreaterThanOrEqual(1);
      expect(last?.tiers?.[0]?.name).toBe("Standard");
      expect(last?.price).toBe("");
    });
  });

  it("'Add variant' opens the shared tier wizard (draftMode PriceEditModal)", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...baseProps({ showTiers: true })} />);

    await user.click(screen.getByRole("button", { name: /add variant/i }));

    // The wizard mounts in draftMode, with no network calls (stub config).
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // It opens straight into the variant editor - the name field is the first
    // thing in it - rather than onto a list the seller has to navigate.
    // The variant-name field specifically - "Personal" alone also matches the
    // licence field's placeholder.
    expect(
      within(dialog).getByPlaceholderText(/Blue \/ M/),
    ).toBeInTheDocument();
  });
});
