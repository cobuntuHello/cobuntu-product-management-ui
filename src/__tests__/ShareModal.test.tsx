import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareModal } from "../components/ShareModal";
import { renderWithConfig } from "./test-utils";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  productId: "p-1",
  communityTag: "orbis",
  productName: "Cool product",
  onClose: vi.fn(),
  ...overrides,
});

describe("ShareModal", () => {
  it("renders the public product URL using the community tag + product id", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByDisplayValue("https://orbis.cobuntu.com/marketplace/p-1")).toBeInTheDocument();
  });

  it("includes Facebook, Twitter, LinkedIn, and Email share links", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByRole("link", { name: /facebook/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /twitter/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /linkedin/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /email/i })).toBeInTheDocument();
  });

  it("renders a Copy button that is clickable", async () => {
    // happy-dom rejects navigator.clipboard.writeText outside a real user
    // gesture, so we can't reliably assert against the spy here. This is the
    // honest scope of the smoke test: the button is present and reachable.
    const user = userEvent.setup();
    renderWithConfig(<ShareModal {...baseProps()} />);

    const copyBtn = screen.getByRole("button", { name: /^copy$/i });
    expect(copyBtn).toBeInTheDocument();
    await user.click(copyBtn);
  });

  it("Close button calls onClose", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<ShareModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
