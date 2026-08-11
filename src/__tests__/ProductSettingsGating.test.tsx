import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithConfig, mockFetch } from "./test-utils";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";
import { ProductSettingsDrawer } from "../page/ProductSettingsDrawer";

/**
 * Community-scoped settings are HIDDEN, not disabled, on a user-owned product.
 *
 * Everything behind Settings — who can see it, who can buy it, its landing
 * page, its post-checkout behaviour — is a statement about a COMMUNITY. A
 * personal product has no membership to gate against and no community
 * storefront, and the backend refuses all four with a 403.
 *
 * So the control must not be rendered at all. A disabled control advertises a
 * capability this product cannot have and asks a question with no answer.
 */

const actions = {
  onShare: vi.fn(),
  onEdit: vi.fn(),
  onSettings: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch([{ method: "GET", url: /.*/, body: {} }]);
});

describe("OverviewActionCards — Settings gating", () => {
  it("shows Settings for a community-owned product", () => {
    renderWithConfig(<OverviewActionCards isPublished={false} canConfigureSettings {...actions} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does NOT render Settings for a user-owned product", () => {
    renderWithConfig(<OverviewActionCards isPublished={false} canConfigureSettings={false} {...actions} />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("hides it rather than disabling it", () => {
    // The distinction that matters: a disabled control is still a claim that
    // the capability exists.
    renderWithConfig(<OverviewActionCards isPublished={false} canConfigureSettings={false} {...actions} />);
    const disabled = screen.queryAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.some((b) => b.textContent?.includes("Settings"))).toBe(false);
  });

  it("keeps the other actions", () => {
    // Hiding Settings must not take Share/Delete with it.
    renderWithConfig(<OverviewActionCards isPublished={false} canConfigureSettings={false} {...actions} />);
    expect(screen.getByText("Share Product")).toBeInTheDocument();
    expect(screen.getByText("Delete Product")).toBeInTheDocument();
  });

  it("opens the drawer when clicked", async () => {
    renderWithConfig(<OverviewActionCards isPublished canConfigureSettings {...actions} />);
    await userEvent.click(screen.getByText("Settings"));
    expect(actions.onSettings).toHaveBeenCalled();
  });
});

describe("ProductSettingsDrawer", () => {
  const product = {
    id: "p1",
    name: "Thing",
    communityId: "c1",
    viewability: "PUBLIC",
    accessibility: "PUBLIC",
    externalDetailUrl: null,
  };

  function renderDrawer(over: Record<string, any> = {}, productOver: Record<string, any> = {}) {
    return renderWithConfig(
      <ProductSettingsDrawer
        product={{ ...product, ...productOver }}
        communityTag="avepark"
        productId="p1"
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
        showToast={vi.fn()}
        {...over}
      />,
    );
  }

  it("lists the four community-scoped settings", async () => {
    renderDrawer();
    expect(await screen.findByText("Who can see this")).toBeInTheDocument();
    expect(screen.getByText("Who can buy this")).toBeInTheDocument();
    expect(screen.getByText("Landing page")).toBeInTheDocument();
    expect(screen.getByText("After checkout")).toBeInTheDocument();
  });

  it("drops After checkout on its own when the viewer is not a leader", async () => {
    // It promotes a community MEMBERSHIP, so the backend wants
    // MARKETPLACE_CREATE on top of community-ownership. The other three rows
    // stay.
    renderDrawer({ hideAfterCheckout: true });
    expect(await screen.findByText("Who can see this")).toBeInTheDocument();
    expect(screen.queryByText("After checkout")).not.toBeInTheDocument();
  });

  it("summarises each row's current value without opening it", async () => {
    renderDrawer({}, { viewability: "MEMBERS_ONLY", externalDetailUrl: "https://example.com" });
    await screen.findByText("Who can see this");
    expect(screen.getByText("Members only")).toBeInTheDocument();
    expect(screen.getByText("Custom landing page")).toBeInTheDocument();
  });

  it("says Anyone, not Public, when ungated", async () => {
    // "Public" reads as a switch position; "Anyone" answers the question the
    // row asks.
    renderDrawer();
    await screen.findByText("Who can see this");
    expect(screen.getAllByText("Anyone").length).toBeGreaterThanOrEqual(2);
  });

  it("renders nothing when closed", () => {
    const { container } = renderDrawer({ isOpen: false });
    expect(container.textContent).toBe("");
  });
});


/**
 * The approval toggle, now a row in this drawer.
 *
 * NOT community-scoped, unlike the four rows above it: a user-owned product
 * can be approval-gated too, so it renders whenever a handler is supplied.
 */
describe("ProductSettingsDrawer — approval row", () => {
  const product = { id: "p1", name: "Thing", communityId: "c1", viewability: "PUBLIC", accessibility: "PUBLIC" };

  function renderDrawer(over: Record<string, any> = {}) {
    return renderWithConfig(
      <ProductSettingsDrawer
        product={product}
        communityTag="avepark"
        productId="p1"
        isOpen
        onClose={vi.fn()}
        onSaved={vi.fn()}
        showToast={vi.fn()}
        {...over}
      />,
    );
  }

  it("is absent when the viewer cannot change it", async () => {
    renderDrawer();
    await screen.findByText("Who can see this");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders as a SWITCH, not a chevron row", async () => {
    // It changes state in place rather than opening an editor, so it must not
    // look like the rows that do.
    renderDrawer({ requiresApproval: false, onSaveApproval: vi.fn() });
    expect(await screen.findByRole("switch")).toBeInTheDocument();
  });

  it("saves the new value", async () => {
    const onSaveApproval = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ requiresApproval: false, onSaveApproval });
    await userEvent.click(await screen.findByRole("switch"));
    expect(onSaveApproval).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  });

  it("REVERTS when the save fails", async () => {
    // Leaving it flipped tells a seller their purchases are gated when the
    // server refused — a money question, not a cosmetic one.
    const onSaveApproval = vi.fn().mockRejectedValue(new Error("nope"));
    renderDrawer({ requiresApproval: false, onSaveApproval });
    await userEvent.click(await screen.findByRole("switch"));
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
  });

  it("ignores a second click while a save is in flight", async () => {
    let resolve: () => void = () => {};
    const onSaveApproval = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    renderDrawer({ requiresApproval: false, onSaveApproval });
    const sw = await screen.findByRole("switch");
    await userEvent.click(sw);
    await userEvent.click(sw);
    expect(onSaveApproval).toHaveBeenCalledTimes(1);
    resolve();
  });

  it("shows for a USER-OWNED product too", async () => {
    // The four community-scoped rows do not apply there, but approval does.
    renderDrawer({ requiresApproval: true, onSaveApproval: vi.fn() });
    expect(await screen.findByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});
