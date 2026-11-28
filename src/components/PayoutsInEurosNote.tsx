/**
 * One line under a currency other than the euro, where a seller picks it
 * (multi-currency MC3c, decision MC-D3: "understandable and not hidden").
 * Cobuntu's Stripe balance holds euros, so a sale in any other currency is
 * paid out in euros at the rate Stripe converted it at (Terms of Service
 * 12.1). Nothing under the euro.
 */
import { useProductT } from "../i18n/productCopy";
export function PayoutsInEurosNote({ currency }: { currency?: string | null }) {
  const tp = useProductT("marketplaceUi.productUi");
  if (!currency || currency.toUpperCase() === "EUR") return null;
  return (
    <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-500" data-testid="payouts-in-euros-note">
      {tp("payoutsInEurosNote.paidOutInEurosAt")}
    </p>
  );
}
