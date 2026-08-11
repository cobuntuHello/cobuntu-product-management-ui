/**
 * Action → sentence renderer for the product activity log. The product
 * sister of the event one, same contract: one function keyed on the entry's
 * `action` + `source`, returning text the component renders with the actor's
 * avatar inline.
 *
 * Design rules (restated rather than cross-referenced — whoever edits this
 * file will not have read the event one):
 *   1. Names come from the hydrated `actor` and from payload fields the BE
 *      denormalised at write time (productName, tierName, communityName,
 *      targetName). We never resolve a name here; the BE already did, at a
 *      moment when the row still existed.
 *   2. An unknown action falls back to a generic sentence. A BE that adds an
 *      action must not blank the tab on an older bundle.
 *   3. Sentences stay short. Detail belongs in the expandable payload.
 *   4. English only, deliberately, matching events — a translation layer
 *      would touch this file and nothing else.
 *
 * Mirrors the payload shapes documented in
 * services/core/src/domains/products/shared/services/ProductAuditService.ts.
 */

export interface ProductActivityEntryForRender {
  source: "PRODUCT_AUDIT" | "COLLABORATOR_AUDIT";
  action: string;
  actor: { id: string; name: string | null; usertag: string | null; profileImage: string | null } | null;
  payload: Record<string, unknown> | null;
}

export interface RenderedProductSentence {
  text: string;
  /** Subject of the action (a co-seller). Consumer may show their avatar. */
  subjectName?: string | null;
}

function actorName(entry: ProductActivityEntryForRender): string {
  return entry.actor?.name?.trim() || entry.actor?.usertag || "Someone";
}

function str(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload) return null;
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(payload: Record<string, unknown> | null, key: string): number | null {
  if (!payload) return null;
  const v = payload[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function arr(payload: Record<string, unknown> | null, key: string): string[] {
  if (!payload) return [];
  const v = payload[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function bool(payload: Record<string, unknown> | null, key: string): boolean {
  return payload?.[key] === true;
}

function fieldsLabel(fields: string[]): string {
  if (fields.length === 0) return "";
  if (fields.length === 1) return ` (${fields[0]})`;
  if (fields.length === 2) return ` (${fields[0]} and ${fields[1]})`;
  return ` (${fields.slice(0, -1).join(", ")}, and ${fields[fields.length - 1]})`;
}

/** "in Ave Park" — omitted entirely when the community name is gone. */
function inCommunity(payload: Record<string, unknown> | null): string {
  const name = str(payload, "communityName");
  return name ? ` in ${name}` : "";
}

/**
 * Commission arrives as a fraction (0.15) on some paths and as whole percent
 * on others. Anything at or below 1 is read as a fraction: a 0.15% commission
 * is not a real rate, whereas a 15% one is the common case, so guessing this
 * way is wrong far less often than trusting either unit outright.
 */
function ratePct(payload: Record<string, unknown> | null, key = "commissionRate"): string | null {
  const raw = num(payload, key);
  if (raw == null) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return `${Number(pct.toFixed(2))}%`;
}

function visibilityLabel(raw: unknown): string {
  if (raw === "MEMBERS_ONLY") return "Members only";
  if (raw === "PUBLIC") return "Public";
  return String(raw ?? "Unknown");
}

export function renderProductActivitySentence(
  entry: ProductActivityEntryForRender,
): RenderedProductSentence {
  const actor = actorName(entry);

  // product_collaborator_audits — the co-seller vocabulary. Kept separate
  // because "ADDED" here and an action name from the other table could
  // otherwise collide.
  if (entry.source === "COLLABORATOR_AUDIT") {
    const target = str(entry.payload, "targetName") ?? str(entry.payload, "targetUsertag") ?? "a member";
    switch (entry.action) {
      case "ADDED":
        return { text: `${actor} added ${target} as a co-seller`, subjectName: target };
      case "PROMOTED_FROM_BUYER":
        return { text: `${actor} made ${target}, who had bought this, a co-seller`, subjectName: target };
      case "REMOVED":
        return { text: `${actor} removed ${target} as a co-seller`, subjectName: target };
      case "DEMOTED_TO_BUYER":
        // Worth spelling out: the person keeps what they paid for. Read as a
        // bare "demoted", this entry looks like access was revoked.
        return { text: `${actor} removed ${target} as a co-seller (they keep their purchase)`, subjectName: target };
      default:
        return { text: `${actor} updated co-sellers`, subjectName: target };
    }
  }

  switch (entry.action) {
    // ── Product lifecycle ───────────────────────────────────────────
    case "PRODUCT_CREATED":
      return { text: `${actor} created this product` };
    case "PRODUCT_UPDATED": {
      const fields = arr(entry.payload, "fields");
      const base = `${actor} edited the product${fieldsLabel(fields)}`;
      // The "why is my listing pending again?" answer, on the entry that
      // caused it — which is the only place anyone will look for it.
      return { text: bool(entry.payload, "sentBackToReview") ? `${base}, sending it back for review` : base };
    }
    case "PRODUCT_DELETED":
      return { text: `${actor} deleted the product` };
    case "PRODUCT_DUPLICATED": {
      const target = str(entry.payload, "targetProductName");
      return { text: target ? `${actor} duplicated it as "${target}"` : `${actor} duplicated the product` };
    }

    // ── Listing lifecycle ───────────────────────────────────────────
    case "LISTING_REQUESTED": {
      const rate = ratePct(entry.payload);
      return { text: `${actor} submitted it for review${inCommunity(entry.payload)}${rate ? ` at ${rate} commission` : ""}` };
    }
    case "LISTING_APPROVED": {
      const rate = ratePct(entry.payload);
      if (bool(entry.payload, "selfListed")) {
        return { text: `${actor} published it${inCommunity(entry.payload)}${rate ? ` at ${rate} commission` : ""}` };
      }
      return { text: `${actor} approved it${inCommunity(entry.payload)}${rate ? ` at ${rate} commission` : ""}` };
    }
    case "LISTING_REJECTED": {
      const reason = str(entry.payload, "reason");
      return { text: `${actor} declined it${inCommunity(entry.payload)}${reason ? `: "${reason}"` : ""}` };
    }
    case "LISTING_REMOVED":
      // The BE distinguishes a seller withdrawing from a leader taking it
      // down; both are CANCELLED on the row, and calling a withdrawal a
      // removal would be a permanent, wrong record of a refusal.
      return {
        text: bool(entry.payload, "closedBySeller")
          ? `${actor} withdrew it${inCommunity(entry.payload)}`
          : `${actor} removed it${inCommunity(entry.payload)}`,
      };
    case "LISTING_HIDDEN":
      return { text: `${actor} hid it from the storefront${inCommunity(entry.payload)}` };
    case "LISTING_UNHIDDEN":
      return { text: `${actor} put it back on the storefront${inCommunity(entry.payload)}` };

    // ── Commission negotiation ──────────────────────────────────────
    case "COMMISSION_PROPOSED": {
      const rate = ratePct(entry.payload, "rate");
      return { text: `${actor} proposed ${rate ?? "a new rate"} commission${inCommunity(entry.payload)}` };
    }
    case "COMMISSION_ACCEPTED": {
      const rate = ratePct(entry.payload, "rate");
      return { text: `${actor} accepted ${rate ?? "the"} commission${inCommunity(entry.payload)}` };
    }
    case "COMMISSION_DECLINED": {
      const rate = ratePct(entry.payload, "rate");
      return { text: `${actor} declined ${rate ?? "the"} commission${inCommunity(entry.payload)}` };
    }

    // ── Pricing ─────────────────────────────────────────────────────
    case "TIER_CREATED": {
      const tier = str(entry.payload, "tierName");
      return { text: tier ? `${actor} added the "${tier}" option` : `${actor} added a pricing option` };
    }
    case "TIER_UPDATED": {
      const tier = str(entry.payload, "tierName");
      const fields = arr(entry.payload, "fields");
      return { text: `${actor} edited ${tier ? `the "${tier}" option` : "a pricing option"}${fieldsLabel(fields)}` };
    }
    case "TIER_DELETED": {
      const tier = str(entry.payload, "tierName");
      return { text: tier ? `${actor} removed the "${tier}" option` : `${actor} removed a pricing option` };
    }

    // ── Files ───────────────────────────────────────────────────────
    case "ATTACHMENT_ADDED": {
      const file = str(entry.payload, "fileName");
      return { text: file ? `${actor} added the file "${file}"` : `${actor} added a file` };
    }
    case "ATTACHMENT_REMOVED": {
      const file = str(entry.payload, "fileName");
      return { text: file ? `${actor} removed the file "${file}"` : `${actor} removed a file` };
    }

    // ── Settings ────────────────────────────────────────────────────
    case "VISIBILITY_UPDATED":
      return { text: `${actor} changed visibility to ${visibilityLabel(entry.payload?.to)}` };
    case "ACCESSIBILITY_UPDATED":
      return { text: `${actor} changed access to ${visibilityLabel(entry.payload?.to)}` };
    case "DISTRIBUTION_UPDATED":
      return { text: `${actor} changed how this product is delivered` };

    default:
      // Rule 2. A BE ahead of this bundle degrades to a vague-but-true
      // sentence rather than an empty row.
      return { text: `${actor} updated the product` };
  }
}

/**
 * Relative timestamp for a feed row. Past ~a week the relative form stops
 * being useful ("47d ago" is not a date anyone can place), so it switches to
 * an absolute one.
 */
export function formatRelativeTime(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const sec = Math.floor((now.getTime() - t) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
