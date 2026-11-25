/**
 * WHO OWNS THIS PRODUCT (OR COURSE), AND WHAT IS THE VIEWER TO IT.
 *
 * The manage header used to say "On sale in PBN · Digital product · EUR 275"
 * under the title. The state lives in the page's own bar and tabs, the price
 * on Overview, and none of it answers what someone opening /manage needs
 * first: whose item this is, and whether they are here to run it or only to
 * look at it. A leader reviewing a member's product and its seller saw the
 * same header.
 *
 * So the header shows the OWNER (the community for a community-owned item,
 * else the member who sells it) and the viewer's RELATIONSHIP to it, worked
 * out here from the payload alone so the community app and the admin classify
 * a viewer the same way. The words are the app's, like the header's other
 * labels: an app maps a `ManageRelationship` to its own copy.
 *
 * The event package carries the twin of this file (eventManageRelationship),
 * with `cohost` where this says `collaborator`.
 */

/** The owner's mark: a community is a rounded square, a person a circle. */
export type ManageOwner =
  | {
      kind: "community";
      id: string | null;
      name: string;
      communityTag: string | null;
      iconUrl: string | null;
    }
  | {
      kind: "person";
      id: string | null;
      name: string;
      usertag: string | null;
      profileImage: string | null;
    };

/**
 * The viewer's relationship to the item, one per case the header words:
 *
 *   owner            a member's item, and the viewer is that member
 *   cohost           a host who is not the owner (events only)
 *   collaborator     a collaborator who is not the owner
 *   leaderHosting    a leader of the community that OWNS the item
 *   leaderReviewing  a leader of a community that only CARRIES someone's item,
 *                    who reviews it and cannot change it
 */
export type ManageRelationship =
  | "owner"
  | "cohost"
  | "collaborator"
  | "leaderHosting"
  | "leaderReviewing";

export interface ManageViewer {
  /** The signed-in viewer. Unknown means no relationship: never guess one. */
  viewerUserId?: string | null;
  /** Does the viewer lead the community with this tag? */
  leads?: (communityTag: string) => boolean;
  /**
   * The community this page is opened in: the site in the community app, the
   * community whose admin it is in the admin app. Used for the carrying
   * community, and for the owning one when the payload does not name its tag.
   */
  communityTag?: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Community-owned or not. `communityId` is the rule the backend's
 * viewerOwnsProduct turns on; `creator.isCommunity` is the same answer on a
 * read that left the column out.
 */
function isCommunityOwned(product: any): boolean {
  return !!product?.communityId || product?.creator?.isCommunity === true;
}

/** The members on the item: `sellers` on the detail reads, `collaborators` on others. */
function sellerRows(product: any): any[] {
  const sellers = Array.isArray(product?.sellers) ? product.sellers : [];
  const collaborators = Array.isArray(product?.collaborators) ? product.collaborators : [];
  return [...sellers, ...collaborators];
}

/**
 * The owner of a product or course, or null when the payload cannot say.
 *
 * The detail reads both apps' manage pages load send the owner as `creator`
 * (the community, or the user) and drop `owner`/`ownerId`, so `creator` is
 * read first. `owner`/`community` cover the reads that still carry them.
 */
export function productManageOwner(product: any): ManageOwner | null {
  if (!product) return null;
  const creator = product.creator ?? null;
  if (isCommunityOwned(product)) {
    const c = (creator?.isCommunity ? creator : null) ?? product.community ?? null;
    const name = str(c?.name);
    if (!name) return null;
    return {
      kind: "community",
      id: str(c?.id) ?? str(product.communityId),
      name,
      communityTag: str(c?.communityTag) ?? str(c?.tagLower),
      iconUrl: str(c?.iconUrl),
    };
  }
  const ownerRow = sellerRows(product).find((s) => s?.role === "OWNER");
  const p =
    product.owner ??
    (creator && creator.isCommunity !== true ? creator : null) ??
    ownerRow?.user ??
    null;
  const name = str(p?.name) ?? str(p?.usertag);
  if (!name) return null;
  return {
    kind: "person",
    id: str(p?.id) ?? str(product.ownerId) ?? str(ownerRow?.userId),
    name,
    usertag: str(p?.usertag),
    profileImage: str(p?.profileImage) ?? str(p?.imageUrl),
  };
}

/**
 * What the viewer is to this product, or null when none of the cases fits (an
 * unknown viewer, or Cobuntu staff opening an item they have no role in). The
 * header then shows the owner alone rather than a relationship that is not
 * true.
 *
 * The order is the point:
 *
 *   - COMMUNITY-OWNED: a leader of the owning community runs it as a leader,
 *     even when they are also on the collaborator list. `viewerCanEdit ===
 *     false` demotes them to reviewing: a leader whose role cannot edit it
 *     must not be told they manage it. A member collaborator who leads
 *     nothing is a collaborator.
 *   - A MEMBER'S item: its owner owns it, whatever else they lead (the OWNER
 *     row, `ownerId`, or the backend's `viewerIsOwner`). Another seller is a
 *     collaborator. A leader with no seller row is reviewing an item their
 *     community carries, which is the read-only case.
 */
export function productManageRelationship(product: any, viewer: ManageViewer): ManageRelationship | null {
  const uid = viewer.viewerUserId;
  if (!product || !uid) return null;
  const leads = (tag: string | null | undefined) => !!tag && !!viewer.leads?.(tag);
  const rows = sellerRows(product);
  const isSeller = rows.some((s) => s?.userId === uid);

  if (isCommunityOwned(product)) {
    const owner = productManageOwner(product);
    const owningTag = owner?.kind === "community" ? owner.communityTag : null;
    if (leads(owningTag ?? viewer.communityTag) && product.viewerCanEdit !== false) return "leaderHosting";
    if (isSeller) return "collaborator";
    if (leads(viewer.communityTag)) return "leaderReviewing";
    return null;
  }

  const owner = productManageOwner(product);
  const isOwner =
    product.viewerIsOwner === true ||
    (owner?.kind === "person" && !!owner.id && owner.id === uid) ||
    rows.some((s) => s?.userId === uid && s?.role === "OWNER");
  if (isOwner) return "owner";
  if (isSeller) return "collaborator";
  if (leads(viewer.communityTag)) return "leaderReviewing";
  return null;
}
