import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareModal, productShareImage, type RenderProductShareQr } from "../components/ShareModal";
import { DetailsView } from "../page/views/DetailsView";
import { renderWithConfig, mockFetch } from "./test-utils";

const URL_SHARED = "https://orbis.cobuntu.com/marketplace/p-1";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  productId: "p-1",
  communityTag: "orbis",
  productName: "Cool product",
  onClose: vi.fn(),
  ...overrides,
});

/** Stands in for the app's QR block: shows what it was handed. */
const qrSlot = (): Mock<RenderProductShareQr> =>
  vi.fn<RenderProductShareQr>(({ url, name }) => <div data-testid="qr-block">{`${name} | ${url}`}</div>);

/*
 * T-409: the modal is laid out as the community app's profile share sheet:
 * the product at the top (its QR code under it where the host app draws one),
 * "Share via" with the networks in their own colours, "Or copy link" with a
 * mono link and a Copy pill, and a close X.
 */
describe("ShareModal", () => {
  it("shows the public product URL using the community tag + product id", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByText(URL_SHARED)).toBeInTheDocument();
  });

  it("shares a course as its course page when the manage page says where that lives", () => {
    renderWithConfig(<ShareModal {...baseProps({ publicUrlBase: "/learning/" })} />);
    expect(screen.getByText("https://orbis.cobuntu.com/learning/p-1")).toBeInTheDocument();
  });

  it("leads with the product's name and banner", () => {
    renderWithConfig(<ShareModal {...baseProps({ product: { media: [{ url: "https://img.test/a.png", order: 0 }] } })} />);
    expect(screen.getByText("Cool product")).toBeInTheDocument();
    expect(document.body.querySelector('img[src="https://img.test/a.png"]')).not.toBeNull();
  });

  it("shows the product's initial when it has no image", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("offers WhatsApp, Facebook, X, LinkedIn and Email, each a link carrying this product's URL", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    const enc = encodeURIComponent(URL_SHARED);
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href") ?? "";
    expect(href(/whatsapp/i)).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(href(/whatsapp/i)).toContain(enc);
    expect(href(/facebook/i)).toBe(`https://www.facebook.com/sharer/sharer.php?u=${enc}`);
    expect(href(/^x$/i)).toContain(`url=${enc}`);
    expect(href(/linkedin/i)).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`);
    expect(href(/email/i)).toMatch(/^mailto:\?subject=Cool%20product&body=/);
    expect(screen.getByRole("link", { name: /email/i })).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: /linkedin/i })).toHaveAttribute("target", "_blank");
  });

  it("has the Share via and Or copy link sections, in that order", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    const via = screen.getByText("Share via");
    const copy = screen.getByText("Or copy link");
    expect(via.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the copy row carries the link and a Copy pill", async () => {
    // happy-dom rejects navigator.clipboard.writeText outside a real user
    // gesture, so the spy is not asserted: the pill is there and clickable.
    const user = userEvent.setup();
    renderWithConfig(<ShareModal {...baseProps()} />);
    const row = screen.getByText(URL_SHARED).parentElement as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /^copy$/i }));
  });

  it("a close X calls onClose", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<ShareModal {...props} />);
    const x = screen.getByRole("button", { name: /^close$/i });
    expect(x.textContent?.trim()).toBe("");
    await user.click(x);
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("ShareModal QR code block", () => {
  it("has no code when the host app passes none (the admin app)", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.queryByTestId("qr-block")).toBeNull();
  });

  it("hands the slot exactly the link the modal shares and copies, the name and the product", () => {
    const renderQr = qrSlot();
    const product = { id: "p-1", name: "Cool product" };
    renderWithConfig(<ShareModal {...baseProps({ product, renderQr })} />);
    expect(renderQr).toHaveBeenCalledWith({ url: URL_SHARED, name: "Cool product", product });
    expect(screen.getByText(URL_SHARED)).toBeInTheDocument();
  });

  it("gives the slot the course page's link for a course", () => {
    const renderQr = qrSlot();
    renderWithConfig(<ShareModal {...baseProps({ publicUrlBase: "/learning/", renderQr })} />);
    expect(renderQr.mock.calls[0][0].url).toBe("https://orbis.cobuntu.com/learning/p-1");
  });

  it("sits under the product's name and above Share via and the copy row", () => {
    renderWithConfig(<ShareModal {...baseProps({ renderQr: qrSlot() })} />);
    const qr = screen.getByTestId("qr-block");
    const title = screen.getByText("Cool product");
    expect(title.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(qr.compareDocumentPosition(screen.getByText("Share via")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(qr.compareDocumentPosition(screen.getByText(URL_SHARED)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("productShareImage", () => {
  it("picks the banner media row, then the first row, then the legacy columns", () => {
    expect(productShareImage({ media: [{ url: "a", order: 0 }, { url: "b", order: 1, isBanner: true }] })).toBe("b");
    expect(productShareImage({ media: [{ url: "b", order: 1 }, { url: "a", order: 0 }] })).toBe("a");
    expect(productShareImage({ media: [], cardImageUrl: "card", bannerImageUrl: "banner" })).toBe("card");
    expect(productShareImage({ bannerImageUrl: "banner" })).toBe("banner");
    expect(productShareImage(undefined)).toBeNull();
  });
});

describe("the manage page threads renderShareQr to the Share modal", () => {
  beforeEach(() => {
    mockFetch([{ method: "GET", url: /.*/, body: {} }]);
  });

  const product = { id: "p1", name: "Course one", price: 0, currency: "EUR", description: "", media: [] };

  it("Share Product opens the modal with the host app's QR block, for the page's public link", async () => {
    const renderQr = qrSlot();
    renderWithConfig(
      <DetailsView
        product={product}
        communityTag="orbis"
        productId="p1"
        isPublished
        listingId={null}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        showToast={vi.fn()}
        publicUrlBase="/learning/"
        renderShareQr={renderQr}
      />,
    );
    expect(screen.queryByTestId("qr-block")).toBeNull();
    await userEvent.click(screen.getByText("Share Product"));
    expect(await screen.findByTestId("qr-block")).toHaveTextContent("Course one | https://orbis.cobuntu.com/learning/p1");
  });

  it("ProductManagePage passes its renderShareQr prop to the Details view", () => {
    const page = readFileSync(resolve(__dirname, "../page/ProductManagePage.tsx"), "utf8");
    const details = page.slice(page.indexOf("<DetailsView"), page.indexOf("/>", page.indexOf("<DetailsView")));
    expect(details).toContain("renderShareQr={renderShareQr}");
  });
});
