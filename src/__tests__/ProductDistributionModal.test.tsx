import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductDistributionModal } from "../components/ProductDistributionModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  product: { id: "p-1", name: "Cool product", listings: [], externalDetailUrl: null },
  communityTag: "orbis",
  productId: "p-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("ProductDistributionModal", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("initial featured state reflects the listing for this communityTag", () => {
    const product = {
      id: "p-1",
      name: "Cool product",
      externalDetailUrl: null,
      listings: [
        { communityTag: "orbis", featured: true },
        { communityTag: "dimmo", featured: false },
      ],
    };
    renderWithConfig(<ProductDistributionModal {...baseProps({ product })} />);
    expect(screen.getByLabelText(/Featured product/i)).toBeChecked();
  });

  it("featured defaults to false when no matching listing is featured", () => {
    renderWithConfig(<ProductDistributionModal {...baseProps()} />);
    expect(screen.getByLabelText(/Featured product/i)).not.toBeChecked();
  });

  it("landing radio starts NATIVE and reveals the URL input when switched to custom", async () => {
    const user = userEvent.setup();
    renderWithConfig(<ProductDistributionModal {...baseProps()} />);

    // Native selected by default → no URL input yet.
    expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /custom landing page/i }));
    expect(screen.getByPlaceholderText(/https:\/\//)).toBeInTheDocument();
  });

  it("initial state derives from externalDetailUrl (custom preselected)", () => {
    const product = { id: "p-1", name: "X", listings: [], externalDetailUrl: "https://shop.example.com/p" };
    renderWithConfig(<ProductDistributionModal {...baseProps({ product })} />);
    expect(screen.getByRole("radio", { name: /custom landing page/i })).toBeChecked();
    expect(screen.getByDisplayValue("https://shop.example.com/p")).toBeInTheDocument();
  });

  it("blocks save on an invalid (non-https) custom URL", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<ProductDistributionModal {...props} />);

    await user.click(screen.getByRole("radio", { name: /custom landing page/i }));
    await user.type(screen.getByPlaceholderText(/https:\/\//), "http://insecure.com");

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByText(/valid https:\/\/ URL/i)).toBeInTheDocument();
  });

  it("PUTs the featured flag to the per-listing endpoint when toggled", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "PUT", url: "/api/listings/communities/orbis/products/p-1/featured", body: { ok: true } },
    ]);
    const props = baseProps();
    renderWithConfig(<ProductDistributionModal {...props} />);

    await user.click(screen.getByLabelText(/Featured product/i));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/featured"));
    expect(call).toBeTruthy();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ featured: true });
  });

  it("PATCHes externalDetailUrl on the product when a custom URL is saved", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "PATCH", url: "/api/users/me/products/p-1", body: { ok: true } },
    ]);
    const props = baseProps();
    renderWithConfig(<ProductDistributionModal {...props} />);

    await user.click(screen.getByRole("radio", { name: /custom landing page/i }));
    await user.type(screen.getByPlaceholderText(/https:\/\//), "https://shop.example.com/p");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/users/me/products/p-1"));
    expect(call).toBeTruthy();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      externalDetailUrl: "https://shop.example.com/p",
    });
  });

  it("uses the onSave callback override instead of PATCHing directly", async () => {
    const user = userEvent.setup();
    mockFetch([]); // any direct fetch would throw "Unmocked fetch"
    const onSave = vi.fn().mockResolvedValue(undefined);
    const props = baseProps({ onSave });
    renderWithConfig(<ProductDistributionModal {...props} />);

    await user.click(screen.getByRole("radio", { name: /custom landing page/i }));
    await user.type(screen.getByPlaceholderText(/https:\/\//), "https://shop.example.com/p");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("https://shop.example.com/p"));
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("Cancel calls onClose without saving", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<ProductDistributionModal {...props} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
