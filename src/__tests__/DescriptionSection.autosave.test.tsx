/**
 * T-386: the Details tab description saves itself (products, and courses,
 * whose manage page is this one plus a Syllabus tab).
 *
 * User, 2026-11-22: "instead of this lonely save button here, let's use
 * debounce or something and auto-save and show little saving prompts". The
 * button is gone; a pause in typing or leaving the field PATCHes the product,
 * and a small status beside the counter says what happened.
 *
 * The rules themselves (debounce, single flight, flush) are pinned in
 * management-ui-shared's useAutosave tests. These pin them on the real section:
 * the real endpoint, the trimmed body, images, failures and read-only.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { RichTextServicesProvider, type RichTextServices } from "@cobuntu/management-ui-shared";
import { DescriptionSection } from "../page/sections/DescriptionSection";
import { ManageAccessProvider } from "../lib/manageAccess";
import { renderWithConfig } from "./test-utils";

const PRODUCT = { id: "prod-1", description: "Old text" };
const PRODUCT_URL = "http://api.test/api/users/me/products/prod-1";

/*
 * Plain response objects, not `new Response`: with fake timers a real body
 * read can wait on a timer that never fires.
 */
const ok = () => ({ ok: true, status: 200, json: async () => ({}) });
const fail = () => ({ ok: false, status: 500, json: async () => ({ error: "Server said no" }) });

type FetchImpl = (url: string, init?: RequestInit) => Promise<unknown>;

function setup({ canEdit = true, fetchImpl, services = {} }: { canEdit?: boolean; fetchImpl?: FetchImpl; services?: RichTextServices } = {}) {
  const onSaved = vi.fn();
  const fetchMock = vi.fn<FetchImpl>(fetchImpl ?? (async () => ok()));
  global.fetch = fetchMock as unknown as typeof fetch;
  const utils = renderWithConfig(
    <ManageAccessProvider canEdit={canEdit}>
      <RichTextServicesProvider value={services}>
        <DescriptionSection product={PRODUCT} productId="prod-1" onSaved={onSaved} />
      </RichTextServicesProvider>
    </ManageAccessProvider>,
  );
  return { ...utils, onSaved, fetchMock };
}

const patches = (m: Mock<FetchImpl>) => m.mock.calls.filter(([, init]) => init?.method === "PATCH");
const bodyOf = (call: Parameters<FetchImpl>) => JSON.parse(String(call[1]!.body));

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const status = () => screen.getByRole("status");
const type = (value: string) => fireEvent.change(textarea(), { target: { value } });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** Let a settled request run through the section, the hook and onSaved. */
const settle = () => act(async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("no Save button", () => {
  it("is gone; the heading stays, and the status line is there instead", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Description" })).toBeInTheDocument();
    expect(status()).toBeEmptyDOMElement();
  });
});

describe("autosave", () => {
  it("PATCHes the trimmed text 800ms after typing stops, then refreshes the product", async () => {
    const { fetchMock, onSaved } = setup();
    type("New text");
    wait(300);
    type("New text, longer  ");
    wait(799);
    expect(patches(fetchMock)).toHaveLength(0);
    wait(1);
    const sent = patches(fetchMock);
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe(PRODUCT_URL);
    expect(bodyOf(sent[0])).toEqual({ description: "New text, longer" });
    expect(status()).toHaveTextContent("Saving...");
    await settle();
    expect(status()).toHaveTextContent("Saved");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("saves at once when the field loses focus", () => {
    const { fetchMock } = setup();
    type("Written, then tabbed away");
    fireEvent.blur(textarea());
    expect(patches(fetchMock)).toHaveLength(1);
    expect(bodyOf(patches(fetchMock)[0])).toEqual({ description: "Written, then tabbed away" });
  });

  it("never sends an unchanged description", () => {
    const { fetchMock } = setup();
    fireEvent.blur(textarea());
    type("Old text!");
    type("Old text");
    wait(2000);
    type("Old text  ");
    fireEvent.blur(textarea());
    wait(2000);
    expect(patches(fetchMock)).toHaveLength(0);
  });

  it("clearing the description saves null, as the Save button did", () => {
    const { fetchMock } = setup();
    type("");
    wait(800);
    expect(bodyOf(patches(fetchMock)[0])).toEqual({ description: null });
  });

  it("keeps one PATCH in flight and sends only the latest text after it", async () => {
    let release!: () => void;
    const first = new Promise<unknown>((r) => { release = () => r(ok()); });
    const fetchImpl = vi.fn<FetchImpl>().mockReturnValueOnce(first).mockImplementation(async () => ok());
    const { fetchMock } = setup({ fetchImpl });
    type("A");
    wait(800);
    type("AB");
    wait(800);
    type("ABC");
    wait(800);
    expect(patches(fetchMock)).toHaveLength(1);
    await act(async () => { release(); });
    await settle();
    expect(patches(fetchMock).map(bodyOf)).toEqual([{ description: "A" }, { description: "ABC" }]);
  });

  it("flushes on pagehide with keepalive, so closing the tab does not lose the edit", () => {
    const { fetchMock } = setup();
    type("Typed and closed");
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    const sent = patches(fetchMock);
    expect(sent).toHaveLength(1);
    expect(sent[0][1]!.keepalive).toBe(true);
  });

  it("flushes on unmount (switching tab)", () => {
    const { fetchMock, unmount } = setup();
    type("Typed then switched tab");
    unmount();
    expect(bodyOf(patches(fetchMock)[0])).toEqual({ description: "Typed then switched tab" });
  });
});

describe("a failed save", () => {
  it("keeps the text, says so with Retry, and Retry saves it", async () => {
    const fetchImpl = vi.fn<FetchImpl>().mockImplementationOnce(async () => fail()).mockImplementation(async () => ok());
    const { fetchMock, onSaved } = setup({ fetchImpl });
    type("Do not lose this");
    wait(800);
    await settle();
    expect(status()).toHaveTextContent("Couldn't save.");
    expect(textarea().value).toBe("Do not lose this");
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(patches(fetchMock)).toHaveLength(2);
    expect(bodyOf(patches(fetchMock)[1])).toEqual({ description: "Do not lose this" });
    expect(status()).toHaveTextContent("Saved");
    expect(textarea().value).toBe("Do not lose this");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe("images", () => {
  it("an image added with Add image is saved with the description", async () => {
    const uploadImage = vi.fn(async () => "https://storage.test/descriptions/a.png");
    const { container, fetchMock } = setup({ services: { uploadImage } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await settle();
    expect(uploadImage).toHaveBeenCalledWith(file);
    wait(800);
    const sent = patches(fetchMock);
    expect(sent).toHaveLength(1);
    expect(bodyOf(sent[0]).description).toContain("![](https://storage.test/descriptions/a.png)");
    expect(bodyOf(sent[0]).description).toContain("Old text");
  });
});

describe("read-only", () => {
  it("saves nothing and shows no status", () => {
    const { fetchMock, unmount } = setup({ canEdit: false });
    expect(screen.queryByRole("status")).toBeNull();
    type("Not mine to change");
    wait(2000);
    fireEvent.blur(textarea());
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    unmount();
    expect(patches(fetchMock)).toHaveLength(0);
  });
});
