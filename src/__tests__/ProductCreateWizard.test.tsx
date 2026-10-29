/**
 * ProductCreateWizard as a host sees it: a transport, navigation and copy, and
 * nothing of the community app. Mirrors @cobuntu/event-management-ui's
 * EventCreateWizard.test.tsx: the transport contract, extra steps, the copy
 * fallback, in-place resume, the portal/theme wiring, step sequencing, draft
 * resume, Stripe gating, submit orchestration and the course-vs-product step
 * difference.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({ fake: null as any, props: [] as any[] }));

vi.mock("../components/ProductForm", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    ProductForm: (props: any) => {
      h.props.push(props);
      useEffect(() => { props.onChange?.(h.fake); }, []);
      return <div data-testid="product-form" data-page={props.page} data-initial-name={props.initialData?.name ?? ""} />;
    },
  };
});

import { ProductCreateWizard } from "../create-wizard/ProductCreateWizard";
import type { ProductCreateWizardTransport, ProductCreateWizardProps } from "../create-wizard/types";
import { createWizardTranslator, formatMessage } from "../create-wizard/i18n";

function fake(over: any = {}) {
  return {
    name: "Handmade candle", description: "", isPaid: false, price: "", currency: "USD", ctaText: "",
    isRecurring: false, recurringInterval: "monthly",
    tiers: [], tags: [], categoryId: null, subCategoryId: null, mediaItems: [], productFiles: [],
    links: [], donation: { enabled: false }, condition: null, parcelClass: null,
    viewability: "PUBLIC", accessibility: "PUBLIC", viewTierIds: [], buyTierIds: [],
    ...over,
  };
}

function transport(over: Partial<ProductCreateWizardTransport> = {}): ProductCreateWizardTransport {
  return {
    listDrafts: vi.fn(async () => []),
    getDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async () => ({ ok: true as const })),
    deleteDraft: vi.fn(async () => {}),
    myPackages: vi.fn(async () => []),
    stripeStatus: vi.fn(async () => ({ connected: true, chargesEnabled: true })),
    permissions: vi.fn(async () => ({ marketplaceCreate: false })),
    categories: vi.fn(async () => []),
    tiers: vi.fn(async () => []),
    createProduct: vi.fn(async () => ({ ok: true as const, productId: "p-1" })),
    ...over,
  };
}

const hrefs = {
  marketplace: "/marketplace", connectStripe: "/stripe", howItWorks: "/how", sellingGuide: "/guide",
  fullGuide: "/full", createAnother: "/marketplace/new", drafts: "/profile",
  viewProduct: (s: string) => `/marketplace/${s}`, manageProduct: (s: string) => `/marketplace/${s}/manage`,
  reviewListing: (s: string) => `/marketplace/${s}/manage/manage-listings`,
};

function renderWizard(over: Partial<ProductCreateWizardProps> = {}) {
  const tr = (over.transport as ProductCreateWizardTransport) ?? transport();
  const navigate = vi.fn();
  const onDone = vi.fn();
  const utils = render(
    <ProductCreateWizard
      community={{ tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true }}
      transport={tr}
      navigation={{ hrefs, navigate, onDone }}
      {...over}
    />,
  );
  return { ...utils, tr, navigate, onDone };
}

const buttons = () => screen.getAllByRole("button").map((b) => b.textContent ?? "");
function press(label: string) {
  const b = screen.getAllByRole("button").find((x) => x.textContent === label);
  if (!b) throw new Error(`no "${label}"; have ${JSON.stringify(buttons())}`);
  fireEvent.click(b);
}
function railLabel() {
  const bar = screen.queryByRole("progressbar");
  return bar?.previousElementSibling?.querySelector("p")?.textContent?.split("·").pop()?.trim() ?? null;
}
function walk() {
  const seen = [railLabel()];
  for (let i = 0; i < 10 && buttons().includes("Next"); i++) { press("Next"); seen.push(railLabel()); }
  return seen;
}

beforeEach(() => {
  h.fake = fake();
  h.props = [];
  try { localStorage.setItem("us-first-time-creator-seen::orbis::product", "1"); } catch { /* ignore */ }
});

describe("transport", () => {
  it("asks for drafts and permissions when the host did not pass them, then opens", async () => {
    const { tr } = renderWizard();
    await screen.findByTestId("product-form");
    expect(tr.listDrafts).toHaveBeenCalledTimes(1);
    expect(tr.permissions).toHaveBeenCalledTimes(1);
    expect(tr.stripeStatus).toHaveBeenCalled();
    expect(tr.categories).toHaveBeenCalled();
    expect(tr.tiers).toHaveBeenCalled();
    expect(tr.myPackages).toHaveBeenCalledWith("DIGITAL");
  });

  it("skips those calls when the host knows the answers", async () => {
    const { tr } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("product-form");
    expect(tr.listDrafts).not.toHaveBeenCalled();
    expect(tr.permissions).not.toHaveBeenCalled();
  });

  it("a leader per transport.permissions gets the ownership step", async () => {
    renderWizard({ transport: transport({ permissions: vi.fn(async () => ({ marketplaceCreate: true })) }) });
    await screen.findByTestId("product-form");
    expect(railLabel()).toBe("Who is selling");
  });

  it("creates through transport.createProduct (a built FormData) and reports to onDone", async () => {
    const { tr, onDone, navigate } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("product-form");
    walk();
    press("Create & Request Listing");
    await waitFor(() => expect(tr.createProduct).toHaveBeenCalledTimes(1));
    const body = (tr.createProduct as any).mock.calls[0][0] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("name")).toBe("Handmade candle");
    expect(body.get("ownership")).toBe("personal");
    expect(body.get("communityTag")).toBe("orbis");
    expect(body.get("requestListing")).toBe("true");
    expect(body.get("publish")).toBe("false");

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({
      product: { id: "p-1", name: "Handmade candle" },
      // A member submission is reviewed (memberRequireApproval: true), so
      // requesting a listing lands PENDING, never live on the button alone.
      outcome: "pending",
      ownership: "personal", extraValues: {},
    }));
    press("View product");
    expect(navigate).toHaveBeenCalledWith("/marketplace/p-1");
  });

  it("a STRIPE_REQUIRED result shows the Stripe notice with the host's connect link", async () => {
    renderWizard({
      initialDrafts: [], canCreateForCommunity: false,
      transport: transport({ createProduct: vi.fn(async () => ({ ok: false as const, status: 400, code: "STRIPE_REQUIRED" })) }),
    });
    await screen.findByTestId("product-form");
    walk();
    press("Create & Request Listing");
    await screen.findByText("Connect Stripe to sell");
    expect(screen.getByText("Connect Stripe").closest("a")).toHaveAttribute("href", "/stripe");
  });

  it("autosave goes through saveDraft and a 409 stops it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saveDraft = vi.fn(async (_id: string, _snap: Record<string, unknown>) => ({ ok: false as const, status: 409 }));
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, transport: transport({ saveDraft }) });
    await screen.findByTestId("product-form");
    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][1]).toMatchObject({ name: "Handmade candle", draftStep: "details", communityId: null });
    h.props.at(-1).onChange(fake({ name: "Changed" }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("Cancel calls onCancel, else navigates to the marketplace href", async () => {
    const onCancel = vi.fn();
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, navigation: { hrefs, onCancel } });
    await screen.findByTestId("product-form");
    press("Cancel");
    expect(onCancel).toHaveBeenCalled();
  });

  it("Save Draft with an empty name, on the details step, relies on ProductForm's own inline warning instead of repeating it in the top banner", async () => {
    // Regression test for the duplicate "give it a name" messages bug: the
    // top FormErrorBanner and ProductForm's inline warning under the Product
    // Name field used to both fire off the same missing-name check. On the
    // "details" step (the step that mounts ProductForm with the name field
    // on screen), the banner must stay silent and let `showErrors` alone
    // drive the inline warning.
    const { tr } = renderWizard({ initialDrafts: [], canCreateForCommunity: false, transport: transport({}) });
    await screen.findByTestId("product-form");
    h.props.at(-1).onChange(fake({ name: "" }));
    press("Save Draft");
    expect(screen.queryByRole("alert")).toBeNull();
    // showErrors still flips true — that's what turns on ProductForm's own
    // inline "Give your product a name" warning.
    await waitFor(() => expect(h.props.at(-1).showErrors).toBe(true));
    expect(tr.createProduct).not.toHaveBeenCalled();
  });

  it("Next with an empty name, on the details step, also stays silent on the top banner", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, transport: transport({}) });
    await screen.findByTestId("product-form");
    h.props.at(-1).onChange(fake({ name: "" }));
    press("Next");
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(h.props.at(-1).showErrors).toBe(true));
    // Still blocked from advancing.
    expect(screen.getByTestId("product-form")).toHaveAttribute("data-page", "listing");
  });
});

describe("drafts without a host route", () => {
  it("resumes a draft in place from the Continue step", async () => {
    const getDraft = vi.fn(async () => ({ id: "d-1", name: "Half done", draftStep: "commerce", communityId: null }));
    renderWizard({
      canCreateForCommunity: false,
      initialDrafts: [{ id: "d-1", kind: "product", name: "Half done", draftStep: "commerce", updatedAt: new Date().toISOString(), communityId: null }],
      transport: transport({ getDraft }),
    });
    expect(railLabel()).toBe("Continue");
    fireEvent.click(screen.getByText("Half done"));
    const form = await screen.findByTestId("product-form");
    await waitFor(() => expect(getDraft).toHaveBeenCalledWith("d-1"));
    await waitFor(() => expect(screen.getByTestId("product-form")).toHaveAttribute("data-initial-name", "Half done"));
    expect(railLabel()).toBe("Deliverable Variants & Pricing");
    expect(form).toBeTruthy();
  });

  it("uses navigation.onResumeDraft when the host has its own route", async () => {
    const onResumeDraft = vi.fn();
    renderWizard({
      canCreateForCommunity: false,
      initialDrafts: [{ id: "d-1", kind: "product", name: "Half done", draftStep: null, updatedAt: new Date().toISOString(), communityId: null }],
      navigation: { hrefs, onResumeDraft },
    });
    fireEvent.click(screen.getByText("Half done"));
    await waitFor(() => expect(onResumeDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "d-1" })));
  });
});

describe("extra steps", () => {
  const extraSteps = [
    {
      id: "about-you",
      label: "About you",
      title: "Tell us about you",
      subtitle: "So the house can reach you.",
      render: ({ value, onChange }: any) => (
        <input aria-label="Phone" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ),
      validate: (v: unknown) => (v ? null : "A phone number is required"),
    },
  ];

  it("appear on the rail after the last Cobuntu step, block Next until valid, and reach onDone", async () => {
    const { tr, onDone } = renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps });
    await screen.findByTestId("product-form");
    expect(walk()).toEqual(["Details", "Deliverable Variants & Pricing", "Policies & access", "Arrangement", "About you"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tell us about you");

    press("Create & Request Listing");
    expect(await screen.findByRole("alert")).toHaveTextContent("A phone number is required");
    expect(tr.createProduct).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+351 900" } });
    press("Create & Request Listing");
    await waitFor(() => expect(tr.createProduct).toHaveBeenCalledTimes(1));
    const body = (tr.createProduct as any).mock.calls[0][0] as FormData;
    // Never sent to Cobuntu.
    for (const [, v] of body.entries()) expect(String(v)).not.toContain("+351");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ extraValues: { "about-you": "+351 900" } })));
  });
});

describe("course vs product steps", () => {
  it("a plain product gets no content step even for a non-leader", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, productType: "DIGITAL" });
    await screen.findByTestId("product-form");
    expect(walk()).toEqual(["Details", "Deliverable Variants & Pricing", "Policies & access", "Arrangement"]);
  });

  it("productType COURSE with no renderContentStep still gets no content step", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, productType: "COURSE" });
    await screen.findByTestId("product-form");
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Arrangement"]);
  });

  it("productType COURSE with renderContentStep gets a content step after commerce, and the form hides repeat-purchase", async () => {
    const { tr, onDone } = renderWizard({
      initialDrafts: [], canCreateForCommunity: false, productType: "COURSE",
      renderContentStep: ({ value, onChange }) => (
        <input aria-label="Syllabus" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ),
      validateContentStep: (v) => (v ? null : "Add at least one lesson"),
    });
    await screen.findByTestId("product-form");
    expect(h.props.at(-1).hideRepeatPurchase).toBe(true);
    expect(h.props.at(-1).productType).toBe("DIGITAL");

    // Walk to "commerce" (Pricing), then try to pass "content" unfilled: Next
    // must refuse (same validate-blocks-Next rule as an extra step).
    press("Next"); // details -> commerce
    expect(railLabel()).toBe("Pricing");
    press("Next"); // commerce -> content
    expect(railLabel()).toBe("Course content");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/content/i);
    press("Next");
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one lesson");
    expect(railLabel()).toBe("Course content");

    fireEvent.change(screen.getByLabelText("Syllabus"), { target: { value: "Lesson 1" } });
    press("Next"); // content -> settings
    expect(railLabel()).toBe("Policies & access");
    press("Next"); // settings -> listing
    expect(railLabel()).toBe("Arrangement");

    press("Create & Request Listing");
    await waitFor(() => expect(tr.createProduct).toHaveBeenCalledTimes(1));
    const body = (tr.createProduct as any).mock.calls[0][0] as FormData;
    expect(body.get("productType")).toBe("COURSE");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe("copy", () => {
  it("defaults to English without a host t", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("product-form");
    expect(screen.getByText("About your product")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
  });

  it("reads every string through a host t, fully qualified", async () => {
    const t = vi.fn((key: string) => `«${key}»`);
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, copy: { t } });
    await screen.findByTestId("product-form");
    expect(screen.getByText("«marketplaceUi.createProductClient.stepDetailsTitle»")).toBeInTheDocument();
    expect(screen.getByText("«shared.howItWorksButton.label»")).toBeInTheDocument();
  });

  it("formats ICU plural/select and rich tags", () => {
    expect(formatMessage("{count, plural, one {# day ago} other {# days ago}}", { count: 1 })).toBe("1 day ago");
    expect(formatMessage("{count, plural, one {# day ago} other {# days ago}}", { count: 3 })).toBe("3 days ago");
    const t = createWizardTranslator();
    expect(t("marketplaceUi.ownership.communityCobuntuFee", { rate: "5%" })).toBe("Cobuntu takes <b>5%</b>");
    expect(t("marketplaceUi.createProductClient.nope")).toBe("marketplaceUi.createProductClient.nope");
  });
});

describe("theme and portals", () => {
  it("without a theme: no themed classes, and portals stay inline unless asked for body", async () => {
    const { container } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("product-form");
    const root = container.querySelector(".cbt-product-wizard")!;
    expect(root.className).toBe("cbt-product-wizard");
    expect(root.querySelector(":scope > .cbt-wizard-portal")).not.toBeNull();
  });

  it("portal=body renders no portal root (the community app)", async () => {
    const { container } = renderWizard({ initialDrafts: [], canCreateForCommunity: false, portal: "body" });
    await screen.findByTestId("product-form");
    expect(container.querySelector(".cbt-wizard-portal")).toBeNull();
  });

  it("a theme sets the variables on the root and themes the portal root", async () => {
    const { container } = renderWizard({
      initialDrafts: [], canCreateForCommunity: false,
      theme: { brandColor: "#0a7", textColor: "#222", bgColor: "#fffaf0", headingFont: "Fraunces" },
    });
    await screen.findByTestId("product-form");
    const root = container.querySelector(".cbt-product-wizard") as HTMLElement;
    expect(root).toHaveClass("cbt-product-wizard--themed");
    expect(root.style.getPropertyValue("--brand-color")).toBe("#0a7");
    expect(root.style.getPropertyValue("--heading-font")).toBe("Fraunces");
    expect(root.querySelector(".cbt-wizard-portal")).toHaveClass("themed-create-form");
  });
});

describe("package hygiene", () => {
  it("the wizard and its parts import nothing from next/*", () => {
    const dir = join(__dirname, "../create-wizard");
    for (const f of readdirSync(dir)) {
      if (!/\.tsx?$/.test(f)) continue;
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/from ["']next\//);
    }
  });
});
