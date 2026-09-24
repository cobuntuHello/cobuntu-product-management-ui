import { describe, it, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

vi.mock("react-quill-new", () => ({ default: () => null }));

/**
 * Deliverables belong to a VARIANT (T-163).
 *
 * These properties used to be asserted against product-level rows, in
 * ProductForm.linkAndLicense.test.tsx. The per-variant redesign moved files,
 * external links and the licence that governs them inside each variant, and
 * those tests went red pointing at rows that no longer exist.
 *
 * They are re-asserted here rather than deleted, because the rows moving is
 * not the same as the rules moving: each one is a claim about what reaches the
 * wire, and dropping the test would have dropped the only check that it still
 * does.
 *
 * Driven through ProductForm → "Add variant" → the editor, rather than by
 * mounting VariantEditView with hand-built props: the thing worth pinning is
 * that a seller's edit survives the commit back into the form's payload, and
 * that path is exactly where it could silently not.
 */

const base = { communityTag: "acme", showTiers: true, categories: [] as any[] };

const lastEmit = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls[onChange.mock.calls.length - 1][0];

/**
 * The variant just added. The form seeds a blank "Standard", so the one the
 * test filled in is the LAST in the emitted array, not the first - reading
 * tiers[0] would assert against the seed and pass on an empty commit.
 */
const addedTier = (onChange: ReturnType<typeof vi.fn>) =>
  lastEmit(onChange).tiers.at(-1);

/** Open the variant editor the way the seller does. */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /add variant/i }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  return screen.getByRole("dialog");
}

/**
 * Name + price the open variant, then Save. Save validates every draft, so
 * without a price the modal never closes and the test would be measuring
 * validation instead of the thing it is about.
 */
async function nameAndSave(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const price = within(dialog).getAllByRole("spinbutton")[0]!;
  await user.clear(price);
  await user.type(price, "25");
  await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("a variant's deliverables reach the payload", () => {
  it("writes licence terms onto the variant, not the product", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);

    const dialog = await openEditor(user);
    await user.type(
      within(dialog).getByPlaceholderText(/Personal use/),
      "Personal use only. No resale.",
    );
    await nameAndSave(user, dialog);

    const emitted = lastEmit(onChange);
    expect(addedTier(onChange).licenseTerms).toBe("Personal use only. No resale.");
    // The product-level field is retired and must stay empty, or the same
    // licence would travel twice and the backend would have to pick one.
    expect(emitted.links).toEqual([]);
    expect(emitted.productFiles).toEqual([]);
  });

  it("offers the downloads cap only once the variant HAS a file, and writes it", async () => {
    /*
     * The cap is per file ("how many times a buyer can re-download a given
     * file"), so on a variant with no files it would be a control governing
     * nothing. Pinning both halves: absent without files, and actually
     * committed when it is there.
     */
    const user = userEvent.setup();
    const onChange = vi.fn();
    const withFile = {
      tiers: [{
        localId: "a", name: "Small", description: "", price: "10",
        currency: "EUR", capacity: "", priceMode: "fixed",
        files: [{ id: "f1", name: "guide.pdf", url: "u" }],
      }],
    } as any;

    // No files → no cap.
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);
    const empty = await openEditor(user);
    expect(
      within(empty).queryByLabelText("Downloads per file, per buyer"),
    ).not.toBeInTheDocument();
    await user.click(within(empty).getByRole("button", { name: /^cancel$/i }));

    // A variant that has one → the cap is there and commits.
    renderWithConfig(<ProductForm {...base} onChange={onChange} initialData={withFile} />);
    await user.click(screen.getByRole("button", { name: /Small/ }));
    const dialog = await screen.findByRole("dialog");
    const cap = within(dialog).getByLabelText("Downloads per file, per buyer");
    await user.clear(cap);
    await user.type(cap, "5");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(addedTier(onChange).maxDownloads).toBe("5");
  });

  it("stages an added link onto the variant's links[]", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithConfig(<ProductForm {...base} onChange={onChange} />);

    const dialog = await openEditor(user);
    await user.click(within(dialog).getByRole("button", { name: /add link/i }));
    const url = within(dialog).getByPlaceholderText(/^https/);
    await user.type(url, "https://seller.example/bonus");
    await nameAndSave(user, dialog);

    expect(addedTier(onChange).links).toEqual(["https://seller.example/bonus"]);
  });
});

describe("the digital delivery channel does not follow a parcel", () => {
  it("offers files and links on a digital variant", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} />);

    const dialog = await openEditor(user);
    expect(within(dialog).getByText("Files")).toBeInTheDocument();
    expect(within(dialog).getByText(/External links/)).toBeInTheDocument();
  });

  it("offers neither on a physical variant", async () => {
    /*
     * A parcel has no download channel. Showing the rows there is how a seller
     * attaches a care guide believing it is a description, and ships the buyer
     * a private download instead.
     */
    const user = userEvent.setup();
    renderWithConfig(<ProductForm {...base} onChange={vi.fn()} productType="PHYSICAL" />);

    const dialog = await openEditor(user);
    expect(within(dialog).queryByText("Files")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/External links/)).not.toBeInTheDocument();
  });
});
