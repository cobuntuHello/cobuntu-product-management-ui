import { createRef } from "react";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemberPricingSection,
  type MemberPricingSectionHandle,
} from "../components/MemberPricingSection";
import { mockFetch, renderWithConfig } from "./test-utils";

const segments = [
  { id: "seg-1", name: "VIPs" },
  { id: "seg-2", name: "Students" },
];

function renderSection(
  handleRef = createRef<MemberPricingSectionHandle>(),
  overrides: { isRecurringTier?: boolean } = {},
) {
  return {
    ref: handleRef,
    ...renderWithConfig(
      <MemberPricingSection
        ref={handleRef}
        communityTag="acme"
        tierId="tier-1"
        currencyCode="EUR"
        currencySymbol="€"
        isRecurringTier={!!overrides.isRecurringTier}
        showToast={() => {}}
      />,
    ),
  };
}

describe("MemberPricingSection (product) — imperative commit API", () => {
  beforeEach(() => {
    mockFetch([
      { method: "GET", url: "/api/communities/acme/segments", body: segments },
      {
        method: "GET",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: [],
      },
    ]);
  });

  it("does not render a Save button (single-Save UX)", async () => {
    renderSection();
    await screen.findByText("VIPs");
    expect(
      screen.queryByRole("button", { name: /Save/i }),
    ).not.toBeInTheDocument();
  });

  it("isDirty() flips when a row is enabled", async () => {
    const { ref } = renderSection();
    await screen.findByText("VIPs");
    expect(ref.current?.isDirty()).toBe(false);
    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    expect(ref.current?.isDirty()).toBe(true);
  });

  it("shows the inline 'unsaved' badge when a row is dirty", async () => {
    renderSection();
    await screen.findByText("VIPs");
    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });

  it("commit() POSTs the enabled row's payload", async () => {
    const ref = createRef<MemberPricingSectionHandle>();
    const fetchFn = mockFetch([
      { method: "GET", url: "/api/communities/acme/segments", body: segments },
      {
        method: "GET",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: [],
      },
      {
        method: "POST",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: { id: "ov-new" },
      },
    ]);
    renderSection(ref);
    await screen.findByText("VIPs");

    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = screen.getAllByPlaceholderText(/20|10|—/)[0];
    fireEvent.change(valueInput, { target: { value: "20" } });

    await ref.current!.commit();

    const postCall = fetchFn.mock.calls.find(
      ([url, init]: any) =>
        url.toString().endsWith("/member-pricing") &&
        (init?.method || "GET") === "POST",
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      segmentId: "seg-1",
      mode: "PERCENT_OFF",
      value: 20,
    });
    // Non-recurring tier: recurringScope must NOT be in the payload.
    expect(body).not.toHaveProperty("recurringScope");
  });

  it("recurring tier includes recurringScope in the POST payload", async () => {
    const ref = createRef<MemberPricingSectionHandle>();
    const fetchFn = mockFetch([
      { method: "GET", url: "/api/communities/acme/segments", body: segments },
      {
        method: "GET",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: [],
      },
      {
        method: "POST",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: { id: "ov-new" },
      },
    ]);
    renderSection(ref, { isRecurringTier: true });
    await screen.findByText("VIPs");

    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = screen.getAllByPlaceholderText(/20|10|—/)[0];
    fireEvent.change(valueInput, { target: { value: "20" } });

    await ref.current!.commit();

    const postCall = fetchFn.mock.calls.find(
      ([url, init]: any) =>
        url.toString().endsWith("/member-pricing") &&
        (init?.method || "GET") === "POST",
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.recurringScope).toBe("ALWAYS");
  });

  it("commit() throws when PERCENT_OFF value is out of range", async () => {
    const ref = createRef<MemberPricingSectionHandle>();
    renderSection(ref);
    await screen.findByText("VIPs");

    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = screen.getAllByPlaceholderText(/20|10|—/)[0];
    fireEvent.change(valueInput, { target: { value: "150" } });

    await expect(ref.current!.commit()).rejects.toThrow(/between 1 and 100/);
  });

  it("commit() DELETEs an existing row that was disabled", async () => {
    const ref = createRef<MemberPricingSectionHandle>();
    const fetchFn = mockFetch([
      { method: "GET", url: "/api/communities/acme/segments", body: segments },
      {
        method: "GET",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: [
          {
            id: "ov-1",
            segmentId: "seg-1",
            mode: "PERCENT_OFF",
            value: 20,
            priority: 0,
          },
        ],
      },
      {
        method: "DELETE",
        url: "/api/communities/acme/tiers/tier-1/member-pricing/ov-1",
        body: {},
      },
    ]);
    renderSection(ref);
    await screen.findByText("VIPs");

    await waitFor(() =>
      expect(
        screen.getByLabelText(/Offer member pricing for VIPs/),
      ).toBeChecked(),
    );

    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    await ref.current!.commit();

    const deleteCall = fetchFn.mock.calls.find(
      ([, init]: any) => (init?.method || "GET") === "DELETE",
    );
    expect(deleteCall).toBeTruthy();
  });

  it("isDirty() resets after a successful commit()", async () => {
    const ref = createRef<MemberPricingSectionHandle>();
    mockFetch([
      { method: "GET", url: "/api/communities/acme/segments", body: segments },
      {
        method: "GET",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: [],
      },
      {
        method: "POST",
        url: "/api/communities/acme/tiers/tier-1/member-pricing",
        body: { id: "ov-new" },
      },
    ]);
    renderSection(ref);
    await screen.findByText("VIPs");

    await userEvent.click(
      screen.getByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = screen.getAllByPlaceholderText(/20|10|—/)[0];
    fireEvent.change(valueInput, { target: { value: "20" } });

    expect(ref.current?.isDirty()).toBe(true);
    await ref.current!.commit();
    await waitFor(() => expect(ref.current?.isDirty()).toBe(false));
  });
});
