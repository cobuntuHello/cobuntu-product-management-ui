"use client";

import { DonationsField as SharedDonationsField } from "@cobuntu/management-ui-shared";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";
import { ModalShell } from "../../ui/modal-shell";

export interface DonationsFieldProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
  /**
   * Whether the seller has a connected Stripe account right now. Donations
   * are charged through the same Connect account a priced tier is, so they
   * need the same gate the "Paid" preset card already has.
   *
   * Optional, default true — a consumer that omits it is byte-identical to
   * before (no gate), matching how this prop didn't exist until the gate
   * was added.
   */
  stripeConnected?: boolean;
  /**
   * Called instead of writing a patch whenever `stripeConnected` is false.
   * ProductForm uses this to open the same "connect Stripe?" confirm it
   * shows for the "Paid" card. Required when `stripeConnected` is passed as
   * false; ignored otherwise.
   */
  onNeedsStripe?: () => void;
}

/**
 * Donations on the create-wizard pricing step.
 *
 * The editor itself now lives in @cobuntu/management-ui-shared (T-123). This
 * file used to be a 160-line component; the events package had a
 * BYTE-IDENTICAL copy of it, and the two were fixed one at a time — an
 * empty-modal bug reached events weeks late, and a wording bug shipped in both
 * for months.
 *
 * What is left here is the ADAPTER: the three things that are genuinely this
 * package's, bound once so no call site has to know about them.
 *
 *   - `getSymbol` — this package keeps its own SUPPORTED_CURRENCIES.
 *   - `tierNoun` — a product sells VARIANTS. Events pass "ticket tier". This
 *     is the wording bug, now impossible to get wrong by construction.
 *   - `ModalShell` — this package's own responsive shell (centred dialog on
 *     desktop, drag-to-dismiss bottom sheet on mobile). The shared package has
 *     a DIFFERENT ModalShell with a different API; letting the shared editor
 *     reach for that one would have silently replaced the mobile drawer.
 *
 * Keep this a binding, not a place to add behaviour. Anything that belongs to
 * the donations editor belongs in the shared package, or the copies start
 * drifting again — which is the entire reason this file shrank.
 */
export function DonationsField({ stripeConnected = true, onNeedsStripe, onUpdate, ...rest }: DonationsFieldProps) {
  /*
   * Blocks the SAVE, not just the look of the row. SharedDonationsField has
   * no explicit Save button — the switch and the amount/goal fields inside
   * its modal all write straight through `onUpdate` as they're edited — so
   * the only place to stop a donation config from being committed while
   * disconnected is this one call site every one of those writes passes
   * through. Guarding it here means enabling the switch, raising the goal,
   * and editing the suggested amounts are ALL refused the same way, not just
   * the switch flip.
   */
  const guardedUpdate = (patch: Partial<DonationDraft>) => {
    if (!stripeConnected) {
      onNeedsStripe?.();
      return;
    }
    onUpdate(patch);
  };
  return (
    <SharedDonationsField
      {...rest}
      onUpdate={guardedUpdate}
      symbolFor={getSymbol}
      tierNoun="variant"
      modalShell={ModalShell}
    />
  );
}
