import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteModal } from "../components/DeleteModal";
import { renderWithConfig } from "./test-utils";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  productName: "Cool product",
  onDelete: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  ...overrides,
});

describe("DeleteModal", () => {
  it("renders the product name in the confirmation copy", () => {
    renderWithConfig(<DeleteModal {...baseProps()} />);
    expect(screen.getByText(/Cool product/)).toBeInTheDocument();
  });

  it("on Delete: calls onDelete, then onClose", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<DeleteModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalled());
    expect(props.onClose).toHaveBeenCalled();
  });

  it("on Delete failure: keeps the modal open", async () => {
    const user = userEvent.setup();
    const props = baseProps({ onDelete: vi.fn().mockRejectedValue(new Error("boom")) });
    renderWithConfig(<DeleteModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalled());
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Cancel calls onClose without invoking onDelete", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<DeleteModal {...props} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
