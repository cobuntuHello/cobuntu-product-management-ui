/**
 * Can this community be paid the commission a member's paid listing implies?
 * Identical to @cobuntu/event-management-ui's create-wizard/
 * communityCommissionGate.ts (lifted from the community app's
 * lib/communityCommissionGate.ts) — the rule is productType-agnostic.
 *
 * MIRRORS THE SERVER: a commission rate > 0 requires the community to have a
 * connected Stripe account to receive it; the community's account is not in
 * the checkout path, only needed to RECEIVE a commission, so a 0% package
 * leaves nothing to block on.
 *
 * Deliberately permissive: this gates a CREATE button, and a false block costs
 * a seller their listing while a false allow costs one round trip. Every
 * unknown (payments undefined, no package chosen, a community-owned listing)
 * allows.
 */
export interface CommissionGateInput {
  ownership: "community" | "personal";
  payments?: { connected: boolean; chargesEnabled: boolean };
  packages: Array<{ id: string; rate: number }>;
  packageId: string | null;
}

export function communityCannotTakeCommission({ ownership, payments, packages, packageId }: CommissionGateInput): boolean {
  if (ownership !== "personal") return false;
  if (!payments) return false;
  if (payments.connected) return false;
  const chosen = packages.find((p) => p.id === packageId);
  if (!chosen) return false;
  return chosen.rate > 0;
}
