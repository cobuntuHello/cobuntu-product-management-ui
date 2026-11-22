/**
 * Can anyone actually PAY for this product (or course)?
 *
 * A refund only means something when money changed hands, so the refund policy
 * setting hangs off this. Paid means any variant that costs something, or is
 * pay-what-you-want (the buyer names an amount, so it is not free). A free
 * variant beside a paid one still makes the product paid.
 *
 * A product with no variants reads its own price.
 */
export function productHasPaidOffer(product: any): boolean {
  const tiers: any[] = Array.isArray(product?.tiers) && product.tiers.length > 0
    ? product.tiers
    : Array.isArray(product?.child_tiers) ? product.child_tiers : [];
  if (tiers.length > 0) {
    return tiers.some((t) => (t?.product?.price ?? t?.price ?? 0) > 0 || t?.priceMode === "pwyw");
  }
  return (product?.price ?? 0) > 0 || product?.priceMode === "pwyw";
}

/** The same question for the create form, where a variant's price is still a string. */
export function formVariantsHavePaid(
  tiers: Array<{ price?: string | number; priceMode?: string; deleted?: boolean }>,
): boolean {
  return (tiers ?? []).some((t) => !t.deleted && (t.priceMode === "pwyw" || Number(t.price) > 0));
}
