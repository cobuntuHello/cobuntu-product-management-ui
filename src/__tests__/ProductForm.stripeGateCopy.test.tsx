import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ProductForm } from "../components/ProductForm";

/**
 * A COMMUNITY-owned listing pays out to the community, so the leave-for-Stripe
 * pop-up behind the locked "Paid" preset must say the community needs Stripe
 * and the host's connectUrl opens the community's Stripe setup. Before, the
 * pop-up always spoke about "your account" and the app linked the member's own
 * onboarding: a leader with a connected personal Stripe went round in a loop.
 */
const base = { communityTag: "acme", showTiers: true, categories: [] as any[], page: "commerce" as const };

describe("the paid gate's pop-up takes the host's words", () => {
  it("shows the override copy for a community-owned listing", () => {
    renderWithConfig(
      <ProductForm
        {...base}
        onChange={vi.fn()}
        stripeStatusOverride={{
          connected: false,
          connectUrl: "https://admin.example/acme/connect-stripe",
          copy: { title: "Connect Acme's Stripe", message: "Acme's money goes to Acme's Stripe.", confirm: "Connect in the admin app" },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(screen.getByText("Connect Acme's Stripe")).toBeInTheDocument();
    expect(screen.getByText("Acme's money goes to Acme's Stripe.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect in the admin app" })).toBeInTheDocument();
  });

  it("keeps the default words without an override copy", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} stripeStatusOverride={{ connected: false, connectUrl: "/my-payouts/onboard" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(screen.getByText("Connect Stripe to accept payments")).toBeInTheDocument();
  });

  it("an empty connectUrl opens nothing (never falls back to another account's onboarding)", () => {
    renderWithConfig(
      <ProductForm {...base} onChange={vi.fn()} stripeStatusOverride={{ connected: false, connectUrl: "", copy: { title: "Connect Acme's Stripe" } }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(screen.queryByText("Connect Acme's Stripe")).not.toBeInTheDocument();
  });
});
