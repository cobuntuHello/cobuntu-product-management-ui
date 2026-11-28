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
 *   4. Words go through the host's translator (marketplaceUi.productUi.activity),
 *      English when it has none.
 *
 * Mirrors the payload shapes documented in
 * services/core/src/domains/products/shared/services/ProductAuditService.ts.
 */

import { getProductT } from "../../i18n/productCopy";

export interface ProductActivityEntryForRender {
  source: "PRODUCT_AUDIT" | "COLLABORATOR_AUDIT" | "SALE";
  action: string;
  actor: { id: string; name: string | null; usertag: string | null; profileImage: string | null } | null;
  payload: Record<string, unknown> | null;
}

export interface RenderedProductSentence {
  text: string;
  /** Subject of the action (a co-seller). Consumer may show their avatar. */
  subjectName?: string | null;
}

/**
 * The words, in the host's language (rule 4 above is what this is: the one
 * file a translation layer touches). English stays byte-identical, so a host
 * without translations, and the tests, read exactly what they read before.
 */
const t = (key: string, values?: Record<string, string | number | Date>) =>
  getProductT("marketplaceUi.productUi")(`activity.${key}`, values);
const locale = () => {
  const l = getProductT("marketplaceUi.productUi")("common.locale");
  try { return Intl.NumberFormat.supportedLocalesOf([l]).length ? l : "en-US"; } catch { return "en-US"; }
};

function actorName(entry: ProductActivityEntryForRender): string {
  // A guest buyer has no account: the address on the sale is their name.
  return entry.actor?.name?.trim() || entry.actor?.usertag || str(entry.payload, "buyerEmail") || t("someone");
}

/** Whoever an access row names: their name, @usertag, or the address it went to. */
function recipientOf(payload: Record<string, unknown> | null): string {
  return str(payload, "name")?.trim()
    || (str(payload, "usertag") ? `@${str(payload, "usertag")}` : null)
    || str(payload, "email")
    || t("someoneLower");
}

/**
 * What else a sale row says (add-vs-gift.md phase 4): the discount code and a
 * bought gift's recipient. Both optional; a plain sale reads as before.
 */
function saleDetails(payload: Record<string, unknown> | null, currency: string | null): string {
  const out: string[] = [];
  const d = payload?.discount as { code?: unknown; amount?: unknown; percentOff?: unknown } | undefined;
  if (d && typeof d.code === "string" && d.code) {
    if (typeof d.percentOff === "number") out.push(t("discountPercent", { code: d.code, percent: d.percentOff }));
    else if (typeof d.amount === "number") out.push(t("discountAmount", { code: d.code, amount: money(d.amount, currency) }));
  }
  const g = payload?.gift as { recipientName?: unknown; recipientUsertag?: unknown; recipientEmail?: unknown } | undefined;
  if (g) {
    const name = (typeof g.recipientName === "string" && g.recipientName.trim())
      || (typeof g.recipientUsertag === "string" && g.recipientUsertag ? `@${g.recipientUsertag}` : "")
      || (typeof g.recipientEmail === "string" ? g.recipientEmail : "");
    if (name) out.push(t("giftFor", { name }));
  }
  return out.map((x) => ` · ${x}`).join("");
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


/** Money in the sale's own currency; amounts are in the smallest unit (cents). */
function money(cents: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: currency || "EUR", maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function bool(payload: Record<string, unknown> | null, key: string): boolean {
  return payload?.[key] === true;
}

/** " (name, price, and description)", joined the way the host's language joins a list. */
function fieldsLabel(fields: string[]): string {
  if (fields.length === 0) return "";
  let list: string;
  try { list = new Intl.ListFormat(locale(), { style: "long", type: "conjunction" }).format(fields); }
  catch { list = fields.length === 2 ? `${fields[0]} and ${fields[1]}` : `${fields.slice(0, -1).join(", ")}, and ${fields[fields.length - 1]}`; }
  return ` (${list})`;
}

/** "in Ave Park" — omitted entirely when the community name is gone. */
function inCommunity(payload: Record<string, unknown> | null): string {
  const name = str(payload, "communityName");
  return name ? t("inCommunity", { name }) : "";
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

const atRate = (rate: string | null) => (rate ? t("atRate", { rate }) : "");

function visibilityLabel(raw: unknown): string {
  if (raw === "MEMBERS_ONLY") return getProductT("marketplaceUi.productUi")("common.membersOnly");
  if (raw === "PUBLIC") return t("public");
  return raw == null ? getProductT("marketplaceUi.productUi")("common.unknown") : String(raw);
}

export function renderProductActivitySentence(
  entry: ProductActivityEntryForRender,
): RenderedProductSentence {
  const actor = actorName(entry);

  // product_collaborator_audits — the co-seller vocabulary. Kept separate
  // because "ADDED" here and an action name from the other table could
  // otherwise collide.
  if (entry.source === "COLLABORATOR_AUDIT") {
    const target = str(entry.payload, "targetName") ?? str(entry.payload, "targetUsertag") ?? t("aMember");
    switch (entry.action) {
      case "ADDED":
        return { text: t("coSellerAdded", { actor, target }), subjectName: target };
      case "PROMOTED_FROM_BUYER":
        return { text: t("coSellerPromoted", { actor, target }), subjectName: target };
      case "REMOVED":
        return { text: t("coSellerRemoved", { actor, target }), subjectName: target };
      case "DEMOTED_TO_BUYER":
        // Worth spelling out: the person keeps what they paid for. Read as a
        // bare "demoted", this entry looks like access was revoked.
        return { text: t("coSellerDemoted", { actor, target }), subjectName: target };
      default:
        return { text: t("coSellersUpdated", { actor }), subjectName: target };
    }
  }

  // sales — somebody ACQUIRED it. The actor is the buyer. A paid checkout and
  // a free one are different things to a seller ("bought" vs "got"), and a sale
  // used to fall through to the generic "updated the product" below.
  if (entry.source === "SALE") {
    const amount = num(entry.payload, "amount") ?? 0;
    const currency = str(entry.payload, "currency");
    const qty = num(entry.payload, "quantity") ?? 1;
    if (entry.action === "PURCHASE_REFUNDED") {
      return { text: t(amount > 0 ? "purchaseRefunded" : "orderRefunded", { actor }) };
    }
    const details = saleDetails(entry.payload, currency);
    if (amount > 0) {
      return { text: qty > 1
        ? t("boughtMany", { actor, qty, amount: money(amount, currency), details })
        : t("boughtOne", { actor, amount: money(amount, currency), details }) };
    }
    return { text: t("gotFree", { actor, details }) };
  }

  switch (entry.action) {
    // ── Product lifecycle ───────────────────────────────────────────
    case "PRODUCT_CREATED":
      return { text: t("created", { actor }) };
    case "PRODUCT_UPDATED": {
      const fields = fieldsLabel(arr(entry.payload, "fields"));
      // The "why is my listing pending again?" answer, on the entry that
      // caused it — which is the only place anyone will look for it.
      return { text: t(bool(entry.payload, "sentBackToReview") ? "editedSentBack" : "edited", { actor, fields }) };
    }
    case "PRODUCT_DELETED":
      return { text: t("deleted", { actor }) };
    case "PRODUCT_DUPLICATED": {
      const target = str(entry.payload, "targetProductName");
      return { text: target ? t("duplicatedAs", { actor, target }) : t("duplicated", { actor }) };
    }

    // ── Listing lifecycle ───────────────────────────────────────────
    case "LISTING_REQUESTED":
      return { text: t("submitted", { actor, community: inCommunity(entry.payload), rate: atRate(ratePct(entry.payload)) }) };
    case "LISTING_APPROVED": {
      const values = { actor, community: inCommunity(entry.payload), rate: atRate(ratePct(entry.payload)) };
      return { text: t(bool(entry.payload, "selfListed") ? "published" : "approved", values) };
    }
    case "LISTING_REJECTED": {
      const reason = str(entry.payload, "reason");
      return { text: t("declined", { actor, community: inCommunity(entry.payload), reason: reason ? t("reasonSuffix", { reason }) : "" }) };
    }
    case "LISTING_REMOVED":
      // The BE distinguishes a seller withdrawing from a leader taking it
      // down; both are CANCELLED on the row, and calling a withdrawal a
      // removal would be a permanent, wrong record of a refusal.
      return { text: t(bool(entry.payload, "closedBySeller") ? "withdrew" : "removed", { actor, community: inCommunity(entry.payload) }) };
    case "LISTING_HIDDEN":
      return { text: t("hid", { actor, community: inCommunity(entry.payload) }) };
    case "LISTING_UNHIDDEN":
      return { text: t("unhid", { actor, community: inCommunity(entry.payload) }) };

    // ── Commission negotiation ──────────────────────────────────────
    case "COMMISSION_PROPOSED": {
      const rate = ratePct(entry.payload, "rate");
      return { text: t(rate ? "proposedRate" : "proposedNewRate", { actor, rate: rate ?? "", community: inCommunity(entry.payload) }) };
    }
    case "COMMISSION_ACCEPTED": {
      const rate = ratePct(entry.payload, "rate");
      return { text: t(rate ? "acceptedRate" : "acceptedCommission", { actor, rate: rate ?? "", community: inCommunity(entry.payload) }) };
    }
    case "COMMISSION_DECLINED": {
      const rate = ratePct(entry.payload, "rate");
      return { text: t(rate ? "declinedRate" : "declinedCommission", { actor, rate: rate ?? "", community: inCommunity(entry.payload) }) };
    }

    // ── Pricing ─────────────────────────────────────────────────────
    case "TIER_CREATED": {
      const tier = str(entry.payload, "tierName");
      return { text: tier ? t("tierAdded", { actor, tier }) : t("tierAddedNoName", { actor }) };
    }
    case "TIER_UPDATED": {
      const tier = str(entry.payload, "tierName");
      const fields = fieldsLabel(arr(entry.payload, "fields"));
      return { text: tier ? t("tierEdited", { actor, tier, fields }) : t("tierEditedNoName", { actor, fields }) };
    }
    case "TIER_DELETED": {
      const tier = str(entry.payload, "tierName");
      return { text: tier ? t("tierRemoved", { actor, tier }) : t("tierRemovedNoName", { actor }) };
    }

    // ── Files ───────────────────────────────────────────────────────
    case "ATTACHMENT_ADDED": {
      const file = str(entry.payload, "fileName");
      return { text: file ? t("fileAdded", { actor, file }) : t("fileAddedNoName", { actor }) };
    }
    case "ATTACHMENT_REMOVED": {
      const file = str(entry.payload, "fileName");
      return { text: file ? t("fileRemoved", { actor, file }) : t("fileRemovedNoName", { actor }) };
    }

    // ── Settings ────────────────────────────────────────────────────
    case "VISIBILITY_UPDATED":
      return { text: t("visibilityChanged", { actor, value: visibilityLabel(entry.payload?.to) }) };
    case "ACCESSIBILITY_UPDATED":
      return { text: t("accessChanged", { actor, value: visibilityLabel(entry.payload?.to) }) };
    case "DISTRIBUTION_UPDATED":
      return { text: t("deliveryChanged", { actor }) };

    // ── Access given away (add-vs-gift.md) ──────────────────────────
    // These fell through to "updated the product" (found live, 2026-11-18).
    case "ACCESS_GRANTED": {
      const who = recipientOf(entry.payload);
      const pending = bool(entry.payload, "pending") ? t("pendingSuffix") : "";
      // A bought gift reaching its person: the actor is the buyer.
      if (bool(entry.payload, "purchased")) {
        return { text: t("giftReceived", { who, actor, pending }), subjectName: who };
      }
      const mode = str(entry.payload, "mode");
      if (mode === "add") return { text: t("accessAdded", { actor, who, pending }), subjectName: who };
      if (mode === "gift") return { text: t("accessGift", { actor, who, pending }), subjectName: who };
      // Before add-vs-gift every grant was given access, no mode recorded.
      return { text: t("accessGiven", { actor, who, pending }), subjectName: who };
    }
    case "ACCESS_REVOKED": {
      const who = recipientOf(entry.payload);
      return { text: t("accessRevoked", { actor, who }), subjectName: who };
    }

    default:
      // Rule 2. A BE ahead of this bundle degrades to a vague-but-true
      // sentence rather than an empty row.
      return { text: t("updated", { actor }) };
  }
}

/**
 * Relative timestamp for a feed row. Past ~a week the relative form stops
 * being useful ("47d ago" is not a date anyone can place), so it switches to
 * an absolute one.
 */
export function formatRelativeTime(iso: string, now: Date): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const sec = Math.floor((now.getTime() - ts) / 1000);
  if (sec < 60) return t("justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t("daysAgo", { n: day });
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}
