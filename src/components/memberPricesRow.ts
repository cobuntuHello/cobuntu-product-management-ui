/**
 * The "Member prices" row on the create wizard's pricing step.
 *
 * Member pricing has always been reachable while creating an item, but only
 * at the very bottom of each variant's editor: open the variant, scroll past
 * files, links, licence, attributes, price and billing mode. Sellers creating
 * a product never found it (reported 2026-11-10, Pathseekers). The row puts it
 * on the step itself, says what is set, and opens the editor at that section.
 *
 * Pure helpers here so the summary wording is testable without the form.
 */
import { formatMoney } from "@cobuntu/management-ui-shared";
import type { DraftTier } from "./PriceEditModal/types";
import type { CommunitySegment, MemberPricingUpsert } from "./PriceEditModal/member-pricing";

/**
 * A variant a member price means something on: one that charges, including
 * pay-what-you-want, and a "Paid" variant whose price is still blank (the
 * seller is setting up a paid item; "Price needed" is not "Free").
 */
export function variantTakesMemberPricing(t: Pick<DraftTier, "price" | "priceMode">): boolean {
  if (t.priceMode === "pwyw") return true;
  const raw = (t.price ?? "").trim();
  if (raw === "") return true;
  const p = parseFloat(raw);
  return !Number.isNaN(p) && p > 0;
}

function describe(row: MemberPricingUpsert, currency: string): string {
  switch (row.mode) {
    case "FREE":
      return "free";
    case "PERCENT_OFF":
      return `${row.value ?? 0}% off`;
    case "FLAT_OFF":
      return `${formatMoney(row.value ?? 0, currency.toUpperCase())} off`;
    case "FIXED_PRICE":
    default:
      return formatMoney(row.value ?? 0, currency.toUpperCase());
  }
}

/**
 * "Creators membership €40.00 · Coach 20% off", or null when the variant has
 * no member prices yet. Tiers the community no longer lists are named "A tier"
 * rather than dropped, so the count never silently shrinks.
 */
export function memberPricingSummary(
  t: Pick<DraftTier, "draftMemberPricing" | "currency">,
  segments: Pick<CommunitySegment, "id" | "name">[],
): string | null {
  const rows = (t.draftMemberPricing ?? []).filter((r) => !!r?.segmentId);
  if (rows.length === 0) return null;
  const nameOf = (id: string) => segments.find((s) => s.id === id)?.name || "A tier";
  return rows.map((r) => `${nameOf(r.segmentId)} ${describe(r, t.currency || "EUR")}`).join(" · ");
}
