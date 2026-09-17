"use client";

import { DonationsField as SharedDonationsField } from "@cobuntu/management-ui-shared";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";
import { ModalShell } from "../../ui/modal-shell";

export interface DonationsFieldProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
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
export function DonationsField(props: DonationsFieldProps) {
  return (
    <SharedDonationsField
      {...props}
      symbolFor={getSymbol}
      tierNoun="variant"
      modalShell={ModalShell}
    />
  );
}
