/**
 * The product description quick-edit runs on the shared DescriptionDialog:
 * the editor fills the dialog, Save sits in the same row as Add image and the
 * counter, and there is no top close X. Save still PATCHes the personal route.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithConfig, mockFetch } from "./test-utils";
import { ProductDescriptionEditModal } from "../components/ProductDescriptionEditModal";

function renderModal() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const showToast = vi.fn();
  renderWithConfig(
    <ProductDescriptionEditModal
      product={{ description: "Old text" }}
      productId="p1"
      onClose={onClose}
      onSaved={onSaved}
      showToast={showToast}
    />,
  );
  return { onClose, onSaved, showToast };
}

const textarea = () => screen.getByRole("dialog").querySelector("textarea") as HTMLTextAreaElement;

describe("ProductDescriptionEditModal", () => {
  it("opens the shared dialog with the saved text and no top close X", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Edit description" })).toBeTruthy();
    expect(textarea().value).toBe("Old text");
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("Save PATCHes the trimmed description, then reports it saved", async () => {
    const fetchMock = mockFetch([
      { method: "PATCH", url: "/api/users/me/products/p1", bodyFn: (init) => JSON.parse(String(init?.body)) },
    ]);
    const { onSaved, showToast } = renderModal();
    fireEvent.change(textarea(), { target: { value: "  New text  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({ description: "New text" });
    expect(showToast).toHaveBeenCalledWith("Description updated");
  });

  it("Cancel closes without saving", () => {
    const fetchMock = mockFetch([]);
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
