import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NameEditModal } from "../components/NameEditModal";
import { renderWithConfig } from "./test-utils";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  currentName: "Old name",
  onSave: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  ...overrides,
});

describe("NameEditModal", () => {
  it("preloads the current name", () => {
    renderWithConfig(<NameEditModal {...baseProps()} />);
    expect(screen.getByDisplayValue("Old name")).toBeInTheDocument();
  });

  it("on Save: calls onSave with the new name, then onClose", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<NameEditModal {...props} />);

    const input = screen.getByDisplayValue("Old name");
    await user.clear(input);
    await user.type(input, "New name");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith("New name"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("on Save failure: keeps the modal open (does NOT call onClose)", async () => {
    const user = userEvent.setup();
    const props = baseProps({ onSave: vi.fn().mockRejectedValue(new Error("boom")) });
    renderWithConfig(<NameEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSave).toHaveBeenCalled());
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("disables Save when the name is empty", async () => {
    const user = userEvent.setup();
    renderWithConfig(<NameEditModal {...baseProps()} />);

    const input = screen.getByDisplayValue("Old name");
    await user.clear(input);

    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
