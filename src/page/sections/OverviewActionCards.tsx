"use client";

interface Card {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}

interface Props {
  /** Is there any ACTIVE listing, i.e. can anyone actually buy this. */
  isSellable: boolean;
  onShare: () => void;
  /** Unused since the Edit Product tile went. Optional so a host that still
   *  passes it does not break; drop it once both apps have. */
  onEdit?: () => void;
  onSettings: () => void;
  onDelete: () => void;
  /**
   * Whether this product can have community-scoped settings at all.
   *
   * FALSE ⇒ the Settings card is not rendered, not disabled. Every setting
   * behind it — who can see, who can buy, landing page, after checkout — is a
   * statement about a COMMUNITY, and a user-owned product has none. The
   * backend 403s all four (communityScopedSettings), so a disabled card would
   * advertise a capability that does not exist for this product and invite
   * "how do I unlock it?", a question with no answer.
   */
  canConfigureSettings?: boolean;
}

export function OverviewActionCards({
  isSellable,
  onShare, onEdit, onSettings, onDelete,
  canConfigureSettings = true,
}: Props) {
  const cards: Card[] = [
    {
      label: "Share Product",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      /*
       * Sharing a link nobody can buy through is the one thing this card
       * should not offer. It read `!isPublished`, which never existed on a
       * product -- it was the host's derived "some listing is ACTIVE", under a
       * name that implied a product-level state. Same value, honest name.
       */
      disabled: !isSellable,
      onClick: onShare,
    },
    /*
     * "EDIT PRODUCT" IS GONE.
     *
     * It opened the whole create form to change one field, and every property
     * it held now has its own row on the card: name, price, description,
     * button text, media, tags and category. A second, competing route to the
     * same edits is how the two pages drifted apart in the first place — the
     * rows say what the value IS, the drawer only ever said "edit".
     *
     * The `onEdit` prop is kept and ignored so a host that still passes it
     * does not break; it can go once both apps have dropped it.
     */
    // "Distribution" opened one modal. It is now "Settings", opening the
    // drawer that holds distribution alongside the other three
    // community-scoped settings — the same consolidation the event page made.
    ...(canConfigureSettings ? [{
      label: "Settings",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-500",
      onClick: onSettings,
    }] : []),
    /*
     * THE PUBLISH CARD IS GONE, and it was never a product-level act.
     *
     * `publishProduct` loaded this product's community_listings and flipped
     * every PAUSED one back to ACTIVE, in one named community, erroring when
     * there were none. So one press changed several agreements at once and
     * named none of them, and on a product nobody carries it could only fail --
     * where the honest message is not "publish" but "nobody can buy this yet".
     *
     * A product has no published state to begin with: products.status is
     * DRAFT | CREATED and nothing else. Everything that decides whether a thing
     * can be bought lives on the LISTING (PENDING | ACTIVE | PAUSED | CANCELLED
     * | REVOKED), one per community, each with its own commission.
     *
     * Pausing was already per-listing; only un-pausing was bulk, so the two
     * halves of one act disagreed about what they operated on. Both are per
     * listing now, on the listing row, in the words the product already uses:
     * "Take off the shelf" and "Put back on the shelf".
     *
     * The endpoints stay for now -- removing them is a separate change with its
     * own caller audit.
     */
    {
      label: "Delete Product",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
      iconBg: "bg-red-50",
      iconColor: "text-red-500",
      destructive: true,
      onClick: onDelete,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <button
          key={c.label}
          onClick={c.disabled ? undefined : c.onClick}
          disabled={c.disabled}
          className={`flex items-center gap-3 p-4 rounded-xl bg-zinc-50 text-left transition-colors ${
            c.disabled
              ? "opacity-40 cursor-not-allowed"
              : c.destructive
                ? "hover:bg-red-50/60 cursor-pointer"
                : "hover:bg-zinc-100 cursor-pointer"
          }`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.iconBg} ${c.iconColor}`}>
            {c.icon}
          </div>
          <span className={`text-[14px] font-medium ${c.destructive ? "text-red-600" : "text-zinc-900"}`}>
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );
}
